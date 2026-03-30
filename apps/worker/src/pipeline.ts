import { supabase } from "./db.js";
import { ALWAYS_CHECK_ARTICLES, getScriptStandardArticle, type GCAMArticle } from "./gcam.js";
import { evidenceHash, lexiconEvidenceHash, computeChunkRunKey } from "./hash.js";
import type { AnalysisChunk, AnalysisJob } from "./jobs.js";
import {
  incrementJobProgress,
  isJobCancelled,
  setChunkDone,
  setChunkFailed,
  setChunkPhase,
  setChunkMultipassStart,
} from "./jobs.js";
import { analyzeLexiconMatches } from "./lexiconMatcher.js";
import { findStringMatches, getLexiconCache } from "./lexiconCache.js";
import { logger } from "./logger.js";
import { callJudgeRaw, callRouter, parseJudgeWithRepair } from "./openai.js";
import { config } from "./config.js";
import { isValidAtomForArticle, normalizeAtomId } from "./policyMap.js";
import type { JudgeFinding } from "./schemas.js";
import { getScriptStandardRouterList } from "./gcam.js";
import { ROUTER_SYSTEM_MSG, JUDGE_SYSTEM_MSG, injectLexiconIntoPrompts, PROMPT_VERSIONS } from "./aiConstants.js";
import { runMultiPassDetection, DETECTION_PASSES, planDetectionPassExecution, type LexiconTerm } from "./multiPassJudge.js";
import { PASS_GATING_VERSION } from "./passGating.js";
import { normalizeMisusedGlossaryPassTitle } from "./findingTitleNormalize.js";
import { runHybridContextPipeline } from "./methodology-v3/index.js";
import { upsertFindingPolicyLinks } from "./policyLinks.js";
import { calculateSeverity } from "./severityRulebook.js";
import { getPrimaryGcamForCanonicalAtom, getPrimaryCanonicalAtomForGcam } from "./canonicalAtomMapping.js";
import { offsetToPageNumber, computePageLocalSpan } from "./offsetToPage.js";
import { getCachedJobResources } from "./jobAnalysisCache.js";
import { refineAtomPrecision } from "./atomPrecision.js";
import { isDetectionVerbatim } from "./textDetectionNormalize.js";

export type FindingWithGlobal = JudgeFinding & {
  source?: "ai" | "lexicon_mandatory" | "manual";
  start_offset_global: number;
  end_offset_global: number;
  policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
  primary_article_id?: number | null;
  related_article_ids?: number[];
  canonical_finding_id?: string | null;
  pillar_id?: string | null;
  secondary_pillar_ids?: string[];
};

const MAX_EVIDENCE_SPAN = 280;
const PIPELINE_LOGIC_VERSION = "v2.4";
const MAX_EVIDENCE_LEN = 260;
const NON_CRITICAL_DB_TIMEOUT_MS = 30_000;
const CRITICAL_DB_TIMEOUT_MS = 60_000;
const HARD_FALLBACK_INSULTS = [
  { term: "نصاب", articleId: 5, atomId: "5-2", severity: "high" as const },
  { term: "حرامي", articleId: 5, atomId: "5-2", severity: "high" as const },
  { term: "كذاب", articleId: 5, atomId: "5-2", severity: "medium" as const },
  { term: "محتال", articleId: 5, atomId: "5-2", severity: "high" as const },
  { term: "لص", articleId: 5, atomId: "5-2", severity: "medium" as const },
] as const;

async function isPartialFinalizeRequested(jobId: string): Promise<boolean> {
  try {
    const { data, error } = await withOperationTimeout(
      "Read job partial finalize state",
      NON_CRITICAL_DB_TIMEOUT_MS,
      supabase
        .from("analysis_jobs")
        .select("partial_finalize_requested")
        .eq("id", jobId)
        .maybeSingle()
    );

    if (error) {
      logger.warn("Failed to read job partial finalize state during chunk processing", {
        jobId,
        error: error.message,
      });
      return false;
    }

    return Boolean((data as { partial_finalize_requested?: boolean | null } | null)?.partial_finalize_requested);
  } catch (error) {
    logger.warn("Timed out reading job partial finalize state during chunk processing", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
      timeoutMs: NON_CRITICAL_DB_TIMEOUT_MS,
    });
    return false;
  }
}

class JobCancelledError extends Error {
  constructor() {
    super("Analysis cancelled by user.");
    this.name = "JobCancelledError";
  }
}

class OperationTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

async function withOperationTimeout<T>(
  operation: string,
  timeoutMs: number,
  promise: PromiseLike<T>
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new OperationTimeoutError(operation, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  const error = new Error(typeof reason === "string" ? reason : "Chunk processing aborted");
  error.name = "AbortError";
  throw error;
}

function compactEvidenceText(s: string): string {
  const cleaned = (s ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > MAX_EVIDENCE_LEN ? `${cleaned.slice(0, MAX_EVIDENCE_LEN)}…` : cleaned;
}

function buildLexiconMandatoryRationale(args: {
  term: string;
  evidence: string;
  articleId: number;
  atomId: string | null;
  articleTitleAr?: string | null;
}): string {
  const evidence = compactEvidenceText(args.evidence);
  const articleRef = args.atomId
    ? `المادة ${args.articleId} (${args.atomId})`
    : `المادة ${args.articleId}`;
  const articleTitle = args.articleTitleAr?.trim() ? ` ${args.articleTitleAr.trim()}` : "";
  return `المقتطف يتضمن المصطلح "${args.term}" كما ورد في النص: "${evidence}". هذا اللفظ مرتبط في القاموس الإلزامي بـ${articleRef}${articleTitle ? ` - ${articleTitle}` : ""} لذلك رُصد كمؤشر مخالفة مباشر يحتاج تحققاً سياقياً عند المراجعة النهائية.`;
}

function buildDirectInsultRationale(args: {
  term: string;
  evidence: string;
  articleId: number;
  atomId: string | null;
}): string {
  const evidence = compactEvidenceText(args.evidence);
  const articleRef = args.atomId
    ? `المادة ${args.articleId} (${args.atomId})`
    : `المادة ${args.articleId}`;
  return `المقتطف يحتوي إهانة أو وصفاً مهيناً مباشراً باللفظ "${args.term}" ضمن العبارة: "${evidence}". لذلك صُنّف كمخالفة لفظية مباشرة تحت ${articleRef} وليس مجرد وصف محايد أو تقني.`;
}

function getLineNumberAt(text: string, index: number): number {
  if (index <= 0) return 1;
  let lines = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") lines++;
  }
  return lines;
}

/**
 * Build micro-windows for long chunks. Returns windows with global offsets.
 */
export function buildMicroWindows(
  chunkText: string,
  chunkStartOffset: number,
  chunkEndOffset: number
): { windowText: string; globalStart: number; globalEnd: number }[] {
  if (chunkText.length <= config.CHUNK_WINDOW_THRESHOLD) return [];
  const size = config.MICRO_WINDOW_SIZE;
  const overlap = config.MICRO_WINDOW_OVERLAP;
  const step = size - overlap;
  const windows: { windowText: string; globalStart: number; globalEnd: number }[] = [];
  for (let i = 0; i < chunkText.length; i += step) {
    const end = Math.min(i + size, chunkText.length);
    const windowText = chunkText.slice(i, end);
    const globalStart = chunkStartOffset + i;
    const globalEnd = chunkStartOffset + end;
    windows.push({ windowText, globalStart, globalEnd });
  }
  return windows;
}

/**
 * Enforce PolicyMap atom ids: if model returned an invalid atom_id for the article, set to null and log.
 * Exported for tests.
 */
export function enforceAtomIds(findings: JudgeFinding[]): JudgeFinding[] {
  return findings.map((f) => {
    const aid = f.article_id;
    const atomId = f.atom_id ?? undefined;
    if (atomId == null || atomId === "") return f;
    const norm = normalizeAtomId(atomId, aid);
    const valid = isValidAtomForArticle(aid, norm);
    if (valid) {
      return norm !== atomId ? { ...f, atom_id: norm } : f;
    }
    logger.warn("Judge returned invalid atom_id; clearing", {
      article_id: aid,
      atom_id: atomId,
      normalized: norm,
    });
    return { ...f, atom_id: null };
  });
}

/**
 * Convert Judge location (chunk-relative) to global offsets.
 */
function toGlobalFinding(
  f: JudgeFinding,
  chunkStartOffset: number
): FindingWithGlobal {
  const start_offset_global = chunkStartOffset + (f.location?.start_offset ?? 0);
  const end_offset_global = chunkStartOffset + (f.location?.end_offset ?? 0);
  return {
    ...f,
    start_offset_global,
    end_offset_global,
  };
}

function severityRank(s: string | null | undefined): number {
  const r: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return s ? (r[s] ?? 0) : 0;
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): number {
  const left = a ?? Number.POSITIVE_INFINITY;
  const right = b ?? Number.POSITIVE_INFINITY;
  return left - right;
}

function compareNullableText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "ar");
}

function compareFindingsStable(a: FindingWithGlobal, b: FindingWithGlobal): number {
  return (
    compareNullableNumber(a.article_id, b.article_id) ||
    compareNullableText(a.atom_id, b.atom_id) ||
    compareNullableNumber(a.start_offset_global, b.start_offset_global) ||
    compareNullableNumber(a.end_offset_global, b.end_offset_global) ||
    compareNullableText(a.evidence_snippet, b.evidence_snippet) ||
    compareNullableText(a.title_ar, b.title_ar) ||
    compareNullableText(a.description_ar, b.description_ar) ||
    compareNullableText(a.source, b.source) ||
    compareNullableText(a.detection_pass, b.detection_pass) ||
    compareNullableText(a.rationale_ar, b.rationale_ar)
  );
}

function compareFindingPreference(a: FindingWithGlobal, b: FindingWithGlobal): number {
  const severityDiff = severityRank(b.severity) - severityRank(a.severity);
  if (severityDiff !== 0) return severityDiff;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  if ((a.is_interpretive ? 1 : 0) !== (b.is_interpretive ? 1 : 0)) {
    return (a.is_interpretive ? 1 : 0) - (b.is_interpretive ? 1 : 0);
  }
  const rationaleLenDiff = (b.rationale_ar?.trim().length ?? 0) - (a.rationale_ar?.trim().length ?? 0);
  if (rationaleLenDiff !== 0) return rationaleLenDiff;
  return compareFindingsStable(a, b);
}

function sortFindingsStable(findings: FindingWithGlobal[]): FindingWithGlobal[] {
  return [...findings].sort(compareFindingsStable);
}

function articleListsAreEquivalent(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

function computeContradictionMetrics(findings: FindingWithGlobal[]): {
  contradictionGroups: number;
  severeDisagreementGroups: number;
} {
  const byEvidence = new Map<string, Set<string>>();
  for (const f of findings) {
    const key = `${f.article_id}|${f.start_offset_global}|${f.end_offset_global}|${(f.evidence_snippet || "").slice(0, 80)}`;
    if (!byEvidence.has(key)) byEvidence.set(key, new Set());
    byEvidence.get(key)!.add(f.severity ?? "medium");
  }
  let contradictionGroups = 0;
  let severeDisagreementGroups = 0;
  for (const sevSet of byEvidence.values()) {
    if (sevSet.size > 1) {
      contradictionGroups++;
      if (sevSet.has("critical") && (sevSet.has("low") || sevSet.has("medium"))) severeDisagreementGroups++;
    }
  }
  return { contradictionGroups, severeDisagreementGroups };
}

/**
 * Dedupe by evidence_hash; keep one per hash (prefer higher severity, then confidence, then non-interpretive).
 */
export function dedupeByHash(findings: FindingWithGlobal[]): FindingWithGlobal[] {
  const byHash = new Map<string, FindingWithGlobal>();
  for (const f of findings) {
    const h = evidenceHash(
      f.article_id,
      f.atom_id ?? null,
      f.start_offset_global,
      f.end_offset_global,
      f.evidence_snippet
    );
    const existing = byHash.get(h);
    if (!existing) {
      byHash.set(h, f);
      continue;
    }
    const better = compareFindingPreference(f, existing) < 0;
    if (better) byHash.set(h, f);
  }
  return sortFindingsStable([...byHash.values()]);
}

/**
 * Overlap > 70% for same article_id+atom_id: keep stronger (severity > confidence > non-interpretive).
 */
export function overlapCollapse(findings: FindingWithGlobal[]): FindingWithGlobal[] {
  const key = (f: FindingWithGlobal) => `${f.article_id}:${f.atom_id ?? ""}`;
  const groups = new Map<string, FindingWithGlobal[]>();
  for (const f of findings) {
    const k = key(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(f);
  }
  const result: FindingWithGlobal[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => {
      return compareFindingPreference(a, b);
    });
    const kept: FindingWithGlobal[] = [];
    for (const f of list) {
      const overlapRatio = (s: number, e: number) => {
        const isectStart = Math.max(s, f.start_offset_global);
        const isectEnd = Math.min(e, f.end_offset_global);
        const isect = Math.max(0, isectEnd - isectStart);
        const len = f.end_offset_global - f.start_offset_global;
        return len > 0 ? isect / len : 0;
      };
      const overlaps = kept.some(
        (k) =>
          overlapRatio(k.start_offset_global, k.end_offset_global) > config.OVERLAP_COLLAPSE_RATIO
      );
      if (!overlaps) kept.push(f);
    }
    result.push(...kept);
  }
  return sortFindingsStable(result);
}

/**
 * Process a single chunk: lexicon -> router -> judge -> verbatim -> micro-windows -> dedupe -> overlap -> insert.
 * normalizedText: full canonical text for this job; used to derive evidence_snippet from global offsets so excerpt matches canonical.
 */
export async function processChunkJudge(
  job: AnalysisJob,
  chunk: AnalysisChunk,
  normalizedText: string | null,
  signal?: AbortSignal
): Promise<void> {
  const chunkStartedAt = Date.now();
  const { id: jobId, script_id: scriptId, version_id: versionId } = job;
  const chunkText = chunk.text;
  const chunkStart = chunk.start_offset;
  const chunkEnd = chunk.end_offset;

  throwIfAborted(signal);
  if (await isJobCancelled(jobId)) {
    await setChunkFailed(chunk.id, "Cancelled by user");
    throw new JobCancelledError();
  }

  if (!chunkText?.trim()) {
    await setChunkDone(chunk.id);
    await incrementJobProgress(jobId);
    return;
  }

  logger.info("[DEBUG] processChunkJudge started", {
    jobId,
    chunkId: chunk.id,
    chunkTextLength: chunkText.length,
    chunkStart,
    chunkEnd,
    ALWAYS_CHECK_ARTICLES_count: ALWAYS_CHECK_ARTICLES.length,
    ALWAYS_CHECK_ARTICLES_ids: [...ALWAYS_CHECK_ARTICLES],
  });

  const jobResourcesStartedAt = Date.now();
  const { pageRows, promptLexiconTerms } = await getCachedJobResources(supabase, jobId, versionId);
  throwIfAborted(signal);
  const jobResourcesDurationMs = Date.now() - jobResourcesStartedAt;
  const pageNumAt = (off: number) =>
    pageRows.length > 0 ? offsetToPageNumber(off, pageRows) : null;
  
  const terms = promptLexiconTerms;
  const { router: routerPrompt, judge: judgePrompt } = injectLexiconIntoPrompts(
    ROUTER_SYSTEM_MSG,
    JUDGE_SYSTEM_MSG,
    terms
  );
  
  logger.info("Lexicon terms injected into prompts", { 
    jobId, 
    chunkId: chunk.id, 
    termsCount: terms.length,
    sampleTerms: terms.slice(0, 3).map(t => t.term)
  });

  // 1) Lexicon mandatory findings (global offsets = chunk start + match range in chunk)
  // evidence_snippet from canonical slice so it matches viewer content; optional context in location for debugging
  const isDev = process.env.NODE_ENV !== "production";
  let lexiconMismatchLogCount = 0;
  const LEXICON_MISMATCH_LOG_CAP = 3;
  const CONTEXT_CHARS = 20;

  // HEALTH CHECK: warn if lexicon cache appears empty
  const lexiconCache = getLexiconCache(supabase);
  const lexiconCount = lexiconCache.getCount();
  if (lexiconCount === 0) {
    logger.warn("Lexicon cache empty for chunk", { jobId, chunkId: chunk.id, lexiconCount: 0 });
  }
  if (isDev) logger.info("Lexicon cache health check", { chunkId: chunk.id, lexiconCount, cacheStatus: "checked" });

  const { mandatoryFindings } = analyzeLexiconMatches(chunkText, supabase);
  const deferredLexiconCandidates: FindingWithGlobal[] = [];
  for (const m of mandatoryFindings) {
    const hash = lexiconEvidenceHash(jobId, m.articleId, m.term.term, m.line_start);
    const startGlobal = chunkStart + m.match.startIndex;
    const endGlobal = chunkStart + m.match.endIndex;
    const matchText = m.match.matchedText;

    // Evidence snippet from canonical when available so offsets align with viewer
    let evidence_snippet: string;
    let location: Record<string, unknown> = {};
    if (normalizedText != null && startGlobal >= 0 && endGlobal <= normalizedText.length) {
      evidence_snippet = normalizedText.slice(startGlobal, endGlobal);
      location = {
        context_before: startGlobal > 0 ? normalizedText.slice(Math.max(0, startGlobal - CONTEXT_CHARS), startGlobal) : "",
        context_after: endGlobal < normalizedText.length ? normalizedText.slice(endGlobal, Math.min(normalizedText.length, endGlobal + CONTEXT_CHARS)) : "",
      };
      // DEV: assert canonical slice equals matched substring (or normalized-equal); log first N mismatches
      if (isDev) {
        const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
        const sliceNorm = norm(evidence_snippet);
        const matchNorm = norm(matchText);
        const equal = evidence_snippet === matchText || sliceNorm === matchNorm;
        if (!equal && lexiconMismatchLogCount < LEXICON_MISMATCH_LOG_CAP) {
          lexiconMismatchLogCount++;
          logger.warn("Lexicon offset mismatch", {
            term: m.term.term,
            term_type: m.term.term_type,
            matchText: matchText.slice(0, 80),
            slicePreview: evidence_snippet.slice(0, 80),
            chunkStart,
            localStart: m.match.startIndex,
            localEnd: m.match.endIndex,
            startGlobal,
            endGlobal,
          });
        }
      }
    } else {
      evidence_snippet = m.evidence_snippet;
    }
    const rationaleAr = buildLexiconMandatoryRationale({
      term: m.term.term,
      evidence: evidence_snippet,
      articleId: m.articleId,
      atomId: m.atomId,
      articleTitleAr: m.term.gcam_article_title_ar ?? null,
    });

    const lexRow = {
      job_id: jobId,
      script_id: scriptId,
      version_id: versionId,
      source: "lexicon_mandatory",
      article_id: m.articleId,
      atom_id: m.atomId,
      severity: m.severity,
      confidence: 1,
      title_ar: `مخالفة من قاموس المصطلحات: ${m.term.term}`,
      description_ar: evidence_snippet,
      rationale_ar: rationaleAr,
      evidence_snippet,
      start_offset_global: startGlobal,
      end_offset_global: endGlobal,
      start_line_chunk: m.line_start,
      end_line_chunk: m.line_end,
      location,
      evidence_hash: hash,
      canonical_atom: getPrimaryCanonicalAtomForGcam(m.articleId, m.atomId) ?? null,
      page_number: pageNumAt(startGlobal),
      ...(() => {
        const pl = computePageLocalSpan(startGlobal, endGlobal, pageRows);
        return {
          start_offset_page: pl.start_offset_page,
          end_offset_page: pl.end_offset_page,
        };
      })(),
    };
    if (config.ANALYSIS_ENGINE === "hybrid") {
      deferredLexiconCandidates.push({
        source: "lexicon_mandatory",
        article_id: lexRow.article_id,
        atom_id: lexRow.atom_id,
        title_ar: lexRow.title_ar,
        description_ar: lexRow.description_ar,
        severity: lexRow.severity as FindingWithGlobal["severity"],
        confidence: 1,
        is_interpretive: false,
        evidence_snippet: lexRow.evidence_snippet,
        location: {
          ...location,
          context_window_id: `ctx-${startGlobal}-${endGlobal}`,
          detection_pass: "glossary",
        } as unknown as JudgeFinding["location"] & Record<string, unknown>,
        depiction_type: "mention",
        speaker_role: "unknown",
        context_window_id: `ctx-${startGlobal}-${endGlobal}`,
        context_confidence: 0.6,
        lexical_confidence: 1,
        policy_confidence: null,
        rationale_ar: rationaleAr,
        final_ruling: null,
        narrative_consequence: "unknown",
        detection_pass: "glossary",
        start_offset_global: startGlobal,
        end_offset_global: endGlobal,
      });
    } else {
      const { data: lexData, error: lexErr } = await supabase
        .from("analysis_findings")
        .upsert(lexRow, { onConflict: "job_id,evidence_hash", ignoreDuplicates: true })
        .select("id,article_id,atom_id,confidence");
      logger.info("Lexicon finding upsert result", {
        jobId, chunkId: chunk.id, hash,
        inserted: lexData?.length ?? 0,
        error: lexErr ?? null,
        rowKeys: Object.keys(lexRow),
      });
      if (lexErr) {
        logger.error("Lexicon finding upsert FAILED", { jobId, chunkId: chunk.id, error: lexErr });
      } else {
        await upsertFindingPolicyLinks(
          (lexData ?? []).map((r) => ({
            id: (r as { id: string }).id,
            article_id: (r as { article_id: number }).article_id,
            atom_id: (r as { atom_id: string | null }).atom_id,
            confidence: (r as { confidence?: number | null }).confidence ?? 1,
          }))
        );
      }
    }
  }

  // 1a) Tiny hard fallback for critical direct insults (deterministic match; independent from model output).
  let hardFallbackInserted = 0;
  for (const rule of HARD_FALLBACK_INSULTS) {
    const hardMatches = findStringMatches(chunkText, rule.term, "word");
    for (const hardMatch of hardMatches) {
      const startLocal = hardMatch.startIndex;
      const endLocal = hardMatch.endIndex;
      const startGlobal = chunkStart + startLocal;
      const endGlobal = chunkStart + endLocal;
      const line = getLineNumberAt(chunkText, startLocal);
      const hash = lexiconEvidenceHash(jobId, rule.articleId, rule.term, line);
      const evidence =
        normalizedText != null && startGlobal >= 0 && endGlobal <= normalizedText.length
          ? normalizedText.slice(startGlobal, endGlobal)
          : rule.term;
      const rationaleAr = buildDirectInsultRationale({
        term: rule.term,
        evidence,
        articleId: rule.articleId,
        atomId: rule.atomId,
      });

      const fallbackRow = {
        job_id: jobId,
        script_id: scriptId,
        version_id: versionId,
        source: "lexicon_mandatory",
        article_id: rule.articleId,
        atom_id: rule.atomId,
        severity: rule.severity,
        confidence: 1,
        title_ar: `مخالفة إساءة مباشرة: ${rule.term}`,
        description_ar: evidence,
        rationale_ar: rationaleAr,
        evidence_snippet: evidence,
        start_offset_global: startGlobal,
        end_offset_global: endGlobal,
        start_line_chunk: line,
        canonical_atom: getPrimaryCanonicalAtomForGcam(rule.articleId, rule.atomId) ?? null,
        end_line_chunk: line,
        location: {},
        evidence_hash: hash,
        page_number: pageNumAt(startGlobal),
        ...(() => {
          const pl = computePageLocalSpan(startGlobal, endGlobal, pageRows);
          return {
            start_offset_page: pl.start_offset_page,
            end_offset_page: pl.end_offset_page,
          };
        })(),
      };

      if (config.ANALYSIS_ENGINE === "hybrid") {
        deferredLexiconCandidates.push({
          source: "lexicon_mandatory",
          article_id: fallbackRow.article_id,
          atom_id: fallbackRow.atom_id,
          title_ar: fallbackRow.title_ar,
          description_ar: fallbackRow.description_ar,
          severity: fallbackRow.severity as FindingWithGlobal["severity"],
          confidence: 1,
          is_interpretive: false,
          evidence_snippet: fallbackRow.evidence_snippet,
          location: {
            ...fallbackRow.location,
            context_window_id: `ctx-${startGlobal}-${endGlobal}`,
            detection_pass: "hard_fallback_insults",
          } as unknown as JudgeFinding["location"] & Record<string, unknown>,
          depiction_type: "mention",
          speaker_role: "unknown",
          context_window_id: `ctx-${startGlobal}-${endGlobal}`,
          context_confidence: 0.65,
          lexical_confidence: 1,
          policy_confidence: null,
          rationale_ar: rationaleAr,
          final_ruling: null,
          narrative_consequence: "unknown",
          detection_pass: "hard_fallback_insults",
          start_offset_global: startGlobal,
          end_offset_global: endGlobal,
        });
      } else {
        const { data: fbData, error: fbErr } = await supabase
          .from("analysis_findings")
          .upsert(fallbackRow, { onConflict: "job_id,evidence_hash", ignoreDuplicates: true })
          .select("id,article_id,atom_id,confidence");
        if (fbErr) {
          logger.error("Hard fallback insult upsert FAILED", { jobId, chunkId: chunk.id, term: rule.term, error: fbErr });
        } else {
          hardFallbackInserted += fbData?.length ?? 0;
          await upsertFindingPolicyLinks(
            (fbData ?? []).map((r) => ({
              id: (r as { id: string }).id,
              article_id: (r as { article_id: number }).article_id,
              atom_id: (r as { atom_id: string | null }).atom_id,
              confidence: (r as { confidence?: number | null }).confidence ?? 1,
            }))
          );
        }
      }
    }
  }
  if (hardFallbackInserted > 0) {
    logger.info("Hard fallback insults inserted", { jobId, chunkId: chunk.id, inserted: hardFallbackInserted });
  }

  // 1b) Idempotency Check & Config Setup
  // Build logicVersion dynamically so cache invalidates automatically when prompts/passes change.
  const passSignature = DETECTION_PASSES.map((p) => `${p.name}:${p.model ?? "default"}`).join("|");
  const jobConfig = (job.config_snapshot as any) || {};
  const analysisProfile = jobConfig.analysis_profile || "balanced";
  const deepAuditorEnabled = jobConfig.deep_auditor_enabled ?? config.ANALYSIS_DEEP_AUDITOR;
  const rationaleModel = config.OPENAI_RATIONALE_MODEL;
  const logicVersion = `pipeline:${PIPELINE_LOGIC_VERSION}|profile:${analysisProfile}|engine:${config.ANALYSIS_ENGINE}|mode:${config.ANALYSIS_HYBRID_MODE}|deepAuditor:${deepAuditorEnabled}|rationaleModel:${rationaleModel}|router:${PROMPT_VERSIONS.router}|judge:${PROMPT_VERSIONS.judge}|auditor:${PROMPT_VERSIONS.auditor}|schema:${PROMPT_VERSIONS.schema}|passes:${passSignature}|passGating:${config.ANALYSIS_PASS_GATING_ENABLED ? PASS_GATING_VERSION : "off"}`;
  const forceFresh = jobConfig.force_fresh === true;
  const routerModel = jobConfig.router_model || config.OPENAI_ROUTER_MODEL;
  const judgeModel = jobConfig.judge_model || config.OPENAI_JUDGE_MODEL;
  const temperature = jobConfig.temperature ?? (config.DETERMINISTIC_MODE ? 0 : 0.4);
  const seed = jobConfig.seed ?? (config.DETERMINISTIC_MODE ? 12345 : undefined);
  const maxRouter = jobConfig.max_router_candidates || 8;

  const runKey = computeChunkRunKey(chunkText, {
    router_model: routerModel,
    judge_model: judgeModel,
    temperature,
    seed: seed ?? 0,
    router_prompt_hash: jobConfig.router_prompt_hash,
    judge_prompt_hash: jobConfig.judge_prompt_hash,
  }, logicVersion);

  if (isDev) {
    logger.info("Chunk run key computed", { chunkId: chunk.id, runKey, logicVersion });
  }

  // Check cache table
  const { data: cachedRun } = forceFresh
    ? { data: null as null }
    : await supabase
        .from("analysis_chunk_runs")
        .select("ai_findings, router_candidates")
        .eq("run_key", runKey)
        .maybeSingle();

  if (forceFresh) {
    logger.info("Force-fresh enabled: bypassing idempotency cache for this job", {
      jobId,
      chunkId: chunk.id,
      runKey,
    });
  }

  // Variables for subsequent steps
  let allFindings: FindingWithGlobal[] = [];
  let selectedIds: number[];
  let routerOutputJson: any = null;

  if (cachedRun) {
    logger.info("Idempotency HIT: Using cached run results", { chunkId: chunk.id, runKey });
    await setChunkPhase(chunk.id, "cached");
    allFindings = sortFindingsStable(((cachedRun.ai_findings as any[]) || []) as FindingWithGlobal[]);
  } else {
    logger.info("Idempotency MISS: Executing AI pipeline", { chunkId: chunk.id, runKey });

    // 2) Router (or high-recall bypass / deterministic no-op skip)
    const routerStartedAt = Date.now();

    if (config.HIGH_RECALL) {
      // High-recall dev mode: judge against ALL 25 articles
      selectedIds = Array.from({ length: 25 }, (_, i) => i + 1);
      logger.info("HIGH_RECALL mode: bypassing router, using all 25 articles", { chunkId: chunk.id });
    } else {
      await setChunkPhase(chunk.id, "router");
      const articleList = getScriptStandardRouterList();
      const routerArticleIds = articleList.map((a) => a.id);
      if (articleListsAreEquivalent(ALWAYS_CHECK_ARTICLES, routerArticleIds)) {
        selectedIds = [...ALWAYS_CHECK_ARTICLES].sort((a, b) => a - b);
        routerOutputJson = {
          skipped: true,
          reason: "always_check_covers_all_scannable_articles",
          candidate_articles: selectedIds.map((article_id) => ({ article_id, confidence: 1 })),
        };
        logger.info("Router skipped because ALWAYS_CHECK_ARTICLES already covers all scannable articles", {
          chunkId: chunk.id,
          selectedCount: selectedIds.length,
        });
      } else {
        try {
          throwIfAborted(signal);
          const routerOut = await callRouter(chunkText, articleList, {
            router_model: routerModel,
            temperature,
            seed,
            max_router_candidates: maxRouter,
          }, routerPrompt, { signal });
          throwIfAborted(signal);
          routerOutputJson = routerOut;
          const candidateIds = routerOut.candidate_articles.map((a) => a.article_id);
          selectedIds = [...new Set([...ALWAYS_CHECK_ARTICLES, ...candidateIds])].sort((a, b) => a - b).slice(0, 25);

          // Verification Log: Proof of determinism for Router
          if (isDev) {
            logger.info("Router deterministic output", {
              chunkId: chunk.id,
              sortedCandidates: candidateIds,
              model: routerModel,
              seed,
              runKey,
            });
          }
        } catch (e) {
          if (
            (e instanceof Error && (e.name === "AbortError" || e.name === "ChunkTimeoutError")) ||
            signal?.aborted
          ) {
            throwIfAborted(signal);
            throw e;
          }
          logger.warn("Router failed, using ALWAYS_CHECK_ARTICLES", { error: String(e) });
          selectedIds = [...ALWAYS_CHECK_ARTICLES];
        }
      }
    }
    const routerDurationMs = Date.now() - routerStartedAt;
    const selectedArticles: GCAMArticle[] = selectedIds.map((id) => getScriptStandardArticle(id));
    logger.info("Articles selected for Multi-Pass Judge", { chunkId: chunk.id, count: selectedIds.length, ids: selectedIds });
    logger.info("[DEBUG] Articles passed to multi-pass", {
      chunkId: chunk.id,
      selectedArticlesCount: selectedArticles.length,
      selectedArticleIds: selectedArticles.map(a => a.id),
    });

    // 3) Multi-Pass Detection (specialized scanners running in parallel)
    allFindings = [];
    try {
      const passExecutionPlan = planDetectionPassExecution(chunkText, selectedArticles, terms);
      await setChunkMultipassStart(chunk.id, Math.max(1, passExecutionPlan.activePasses.length));
      const multiPassStartedAt = Date.now();
      throwIfAborted(signal);
      const multiPassResult = await runMultiPassDetection(
        chunkText,
        chunkStart,
        chunkEnd,
        selectedArticles,
        terms,
        { temperature, seed },
        { chunkId: chunk.id },
        passExecutionPlan,
        signal
      );
      throwIfAborted(signal);
      await setChunkPhase(chunk.id, "postprocess");
      logger.info("Post-multipass refinement starting", {
        jobId,
        chunkId: chunk.id,
        runKey,
        rawFindings: multiPassResult.findings.length,
        executedPassCount: multiPassResult.executedPassCount,
        skippedPassCount: multiPassResult.skippedPassCount,
      });
      
      // Enforce atom_ids and prefer literal local evidence from chunk offsets.
      const enforced = multiPassResult.findings.map(f => enforceAtomIds([f])[0]);
      const precisionRefined = enforced.map((f) => refineAtomPrecision(f));
      const enriched = precisionRefined.map((f) => {
        const localStart = Math.max(0, f.location?.start_offset ?? 0);
        const localEnd = Math.min(chunkText.length, f.location?.end_offset ?? localStart);
        const fallback = localEnd > localStart ? chunkText.slice(localStart, localEnd) : "";
        if (fallback && isDetectionVerbatim(chunkText, fallback)) {
          return { ...f, evidence_snippet: fallback };
        }
        if (f.evidence_snippet && f.evidence_snippet.trim().length > 0) return f;
        return { ...f, evidence_snippet: fallback };
      });
      const withGlobal = enriched.map((f) => toGlobalFinding(f, chunkStart));
      logger.info("Post-multipass refinement completed", {
        jobId,
        chunkId: chunk.id,
        runKey,
        enforcedCount: enforced.length,
        precisionRefinedCount: precisionRefined.length,
        enrichedCount: enriched.length,
        globalizedCount: withGlobal.length,
      });
      
      // Final guardrail: keep only findings anchored to literal script text.
      const beforeVerbatimCount = withGlobal.length;
      logger.info("Verbatim guardrail starting", {
        jobId,
        chunkId: chunk.id,
        runKey,
        findingsToCheck: beforeVerbatimCount,
      });
      allFindings = withGlobal.filter((f) => {
        const isExact = isDetectionVerbatim(chunkText, f.evidence_snippet);
        if (!isExact) {
          logger.warn("Evidence mismatch (dropping finding)", { 
            chunkId: chunk.id,
            article: f.article_id,
            evidence: f.evidence_snippet?.slice(0, 50),
            severity: f.severity
          });
        }
        return isExact;
      });
      allFindings = sortFindingsStable(allFindings);
      logger.info("Verbatim guardrail completed", {
        jobId,
        chunkId: chunk.id,
        runKey,
        beforeVerbatim: beforeVerbatimCount,
        afterVerbatim: allFindings.length,
        dropped: beforeVerbatimCount - allFindings.length,
      });
      
      logger.info("Multi-pass detection stats", {
        chunkId: chunk.id,
        runKey,
        totalPasses: multiPassResult.passResults.length,
        executedPasses: multiPassResult.executedPassCount,
        skippedPasses: multiPassResult.skippedPassCount,
        beforeVerbatim: beforeVerbatimCount,
        afterVerbatim: allFindings.length,
        dropped: beforeVerbatimCount - allFindings.length,
        duration: multiPassResult.totalDuration,
        passBreakdown: multiPassResult.passResults.map(r => ({
          pass: r.passName,
          findings: r.findings.length,
          duration: r.duration,
          skipped: r.skipped ?? false,
          reason: r.reason ?? null,
        }))
      });
      logger.info("Chunk multipass timings", {
        jobId,
        chunkId: chunk.id,
        runKey,
        routerDurationMs,
        multiPassDurationMs: Date.now() - multiPassStartedAt,
      });
    } catch (e) {
      if (
        (e instanceof Error && (e.name === "AbortError" || e.name === "ChunkTimeoutError")) ||
        signal?.aborted
      ) {
        throwIfAborted(signal);
        throw e;
      }
      logger.error("Multi-pass detection failed", { error: String(e), chunkId: chunk.id });
    }

    // 4) Micro-windows (DISABLED for multi-pass - full chunk coverage is sufficient)
    // Multi-pass already provides comprehensive coverage, micro-windows add redundancy
    logger.info("Micro-windows skipped (multi-pass provides full coverage)", { chunkId: chunk.id });

    // 5) Dedupe + overlap
    const beforeDedupeCount = allFindings.length;
    allFindings = dedupeByHash(allFindings);
    const afterDedupeCount = allFindings.length;
    allFindings = overlapCollapse(allFindings);
    const afterOverlapCount = allFindings.length;
    logger.info("Dedupe + overlap stats", {
      chunkId: chunk.id,
      runKey,
      beforeDedupe: beforeDedupeCount,
      afterDedupe: afterDedupeCount,
      dedupeDropped: beforeDedupeCount - afterDedupeCount,
      afterOverlap: afterOverlapCount,
      overlapDropped: afterDedupeCount - afterOverlapCount,
      finalAiFindings: afterOverlapCount,
      lexiconFindings: mandatoryFindings.length,
    });

    // CACHE PURGE / PERSIST
    logger.info("Persisting analysis_chunk_run started", {
      jobId,
      chunkId: chunk.id,
      runKey,
      findingsCount: allFindings.length,
      timeoutMs: NON_CRITICAL_DB_TIMEOUT_MS,
    });
    let runErr: { message: string } | null = null;
    try {
      const result = await withOperationTimeout(
        "Persist analysis_chunk_run",
        NON_CRITICAL_DB_TIMEOUT_MS,
        supabase.from("analysis_chunk_runs").insert({
          run_key: runKey,
          job_id: jobId,
          router_candidates: routerOutputJson,
          ai_findings: allFindings
        })
      );
      runErr = result.error;
    } catch (error) {
      logger.warn("Timed out persisting analysis_chunk_run", {
        jobId,
        chunkId: chunk.id,
        runKey,
        error: error instanceof Error ? error.message : String(error),
        timeoutMs: NON_CRITICAL_DB_TIMEOUT_MS,
      });
    }
    throwIfAborted(signal);

    if (runErr) {
      logger.warn("Failed to persist analysis_chunk_run", { runKey, error: runErr.message });
    } else {
      logger.info("Persisted analysis_chunk_run", { runKey });
    }
  }

  // 6) Hybrid context arbitration and instrumentation hooks.
  const baselineFindings = sortFindingsStable([...allFindings, ...deferredLexiconCandidates]);
  const baselineMetrics = computeContradictionMetrics(baselineFindings);
  let persistedFindings: FindingWithGlobal[] = baselineFindings;
  let hybridMetrics: Record<string, unknown> | null = null;
  const partialFinalizeRequested = await isPartialFinalizeRequested(jobId);
  throwIfAborted(signal);
  if (partialFinalizeRequested) {
    logger.info("Partial finalize requested; skipping hybrid context pipeline for current chunk", {
      jobId,
      chunkId: chunk.id,
      baselineFindings: baselineFindings.length,
    });
    hybridMetrics = { skipped_reason: "partial_finalize_requested" };
  } else if (config.ANALYSIS_ENGINE === "hybrid") {
    await setChunkPhase(chunk.id, "hybrid");
    const hybridStartedAt = Date.now();
    let hybridTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    logger.info("Hybrid context pipeline starting", {
      jobId,
      chunkId: chunk.id,
      runKey,
      baselineFindings: baselineFindings.length,
      deepAuditorEnabled,
      hybridMode: config.ANALYSIS_HYBRID_MODE,
      hardTimeoutMs: config.HYBRID_HARD_TIMEOUT_MS,
    });
    try {
      const hybrid = await Promise.race([
        runHybridContextPipeline({
          findings: baselineFindings.map((f) => ({
            ...f,
            severity: f.severity ?? "medium",
            primary_article_id: f.primary_article_id ?? undefined,
            canonical_finding_id: f.canonical_finding_id ?? undefined,
            pillar_id: f.pillar_id ?? undefined,
          })),
          fullText: normalizedText,
          deepAuditorEnabled,
          signal,
        }),
        new Promise<never>((_, reject) => {
          hybridTimeoutHandle = setTimeout(() => {
            const error = new Error("Hybrid context pipeline hard timeout");
            error.name = "HybridTimeoutError";
            reject(error);
          }, config.HYBRID_HARD_TIMEOUT_MS);
        }),
      ]);
      if (hybridTimeoutHandle) clearTimeout(hybridTimeoutHandle);
      throwIfAborted(signal);
      hybridMetrics = hybrid.metrics;
      if (config.ANALYSIS_HYBRID_MODE === "enforce") {
        persistedFindings = sortFindingsStable(hybrid.findings as FindingWithGlobal[]);
      } else {
        // Shadow: persist hybrid so the report shows auditor rationale and primary article; eval log still compares baseline vs hybrid.
        persistedFindings = sortFindingsStable(hybrid.findings as FindingWithGlobal[]);
      }
      logger.info("Hybrid context pipeline completed", {
        jobId,
        chunkId: chunk.id,
        runKey,
        hybridDurationMs: Date.now() - hybridStartedAt,
        baselineCount: baselineFindings.length,
        persistedCount: persistedFindings.length,
      });
      if (config.ANALYSIS_EVAL_LOG) {
        const evalPayload = {
          job_id: jobId,
          chunk_id: chunk.id,
          run_key: runKey,
          engine: config.ANALYSIS_ENGINE,
          mode: config.ANALYSIS_HYBRID_MODE,
          baseline_count: baselineFindings.length,
          hybrid_count: hybrid.findings.length,
          baseline_contradictions: baselineMetrics.contradictionGroups,
          baseline_severe_disagreements: baselineMetrics.severeDisagreementGroups,
          hybrid_context_ok: hybrid.metrics.contextOkCount,
          hybrid_needs_review: hybrid.metrics.needsReviewCount,
          hybrid_violation: hybrid.metrics.violationCount,
        };
        try {
          await withOperationTimeout(
            "Persist analysis_engine_evaluation",
            NON_CRITICAL_DB_TIMEOUT_MS,
            supabase.from("analysis_engine_evaluations").insert(evalPayload)
          );
        } catch (error) {
          logger.warn("Failed to persist analysis engine evaluation", {
            jobId,
            chunkId: chunk.id,
            runKey,
            error: error instanceof Error ? error.message : String(error),
            timeoutMs: NON_CRITICAL_DB_TIMEOUT_MS,
          });
        }
      }
    } catch (error) {
      if (
        (error instanceof Error && (error.name === "AbortError" || error.name === "ChunkTimeoutError")) ||
        signal?.aborted
      ) {
        throwIfAborted(signal);
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Hybrid context pipeline failed or timed out; falling back to baseline findings", {
        jobId,
        chunkId: chunk.id,
        error: message,
        baselineFindings: baselineFindings.length,
        hybridDurationMs: Date.now() - hybridStartedAt,
        hybridHardTimeoutMs: config.HYBRID_HARD_TIMEOUT_MS,
      });
      hybridMetrics = {
        skipped_reason: error instanceof Error && error.name === "HybridTimeoutError" ? "hard_timeout" : "hybrid_failed",
        error: message,
        fallback_to_baseline: true,
      };
      persistedFindings = baselineFindings;
    } finally {
      if (hybridTimeoutHandle) clearTimeout(hybridTimeoutHandle);
    }
  }
  logger.info("Analysis contradiction metrics", {
    jobId,
    chunkId: chunk.id,
    runKey,
    baselineMetrics,
    hybridMetrics,
    persistedCount: persistedFindings.length,
    engine: config.ANALYSIS_ENGINE,
    hybridMode: config.ANALYSIS_HYBRID_MODE,
  });

  throwIfAborted(signal);
  if (await isJobCancelled(jobId)) {
    await setChunkFailed(chunk.id, "Cancelled by user");
    throw new JobCancelledError();
  }

  // 7) Resolve article_id/atom_id from canonical_atom when missing; compute severity from factors when present.
  const resolvedFindings = sortFindingsStable(persistedFindings.map((f) => {
    let article_id = f.article_id;
    let atom_id = f.atom_id ?? null;
    let severity = f.severity ?? null;
    const canonical_atoms = (f as { canonical_atoms?: string[] | null }).canonical_atoms;
    let canonical_atom = (f as { canonical_atom?: string | null }).canonical_atom ?? null;
    if (Array.isArray(canonical_atoms) && canonical_atoms.length > 0) {
      canonical_atom = canonical_atoms[0];
    }
    const intensity = (f as { intensity?: number | null }).intensity ?? null;
    const context_impact = (f as { context_impact?: number | null }).context_impact ?? null;
    const legal_sensitivity = (f as { legal_sensitivity?: number | null }).legal_sensitivity ?? null;
    const audience_risk = (f as { audience_risk?: number | null }).audience_risk ?? null;
    if (article_id === 0 && canonical_atom) {
      const gcam = getPrimaryGcamForCanonicalAtom(canonical_atom);
      if (gcam) {
        article_id = gcam.article_id;
        atom_id = atom_id ?? gcam.atom_id;
      }
    }
    if (article_id === 0) article_id = 5;
    if (severity == null && canonical_atom && (intensity != null || context_impact != null || legal_sensitivity != null || audience_risk != null)) {
      severity = calculateSeverity({
        canonical_atom,
        intensity: intensity ?? 1,
        context_impact: context_impact ?? 1,
        legal_sensitivity: legal_sensitivity ?? undefined,
        audience_risk: audience_risk ?? undefined,
      });
    }
    if (severity == null) severity = "medium";
    return {
      ...f,
      article_id,
      atom_id,
      severity,
      canonical_atom,
      intensity,
      context_impact,
      legal_sensitivity,
      audience_risk,
    };
  }));

  throwIfAborted(signal);
  await setChunkPhase(chunk.id, "aggregating");

  // 8) Insert findings (batch upsert with logging). Derive excerpt from canonical when available.
  throwIfAborted(signal);
  if (await isJobCancelled(jobId)) {
    await setChunkFailed(chunk.id, "Cancelled by user");
    throw new JobCancelledError();
  }
  if (resolvedFindings.length > 0) {
    const insertStartedAt = Date.now();
      const rows = resolvedFindings.map((f) => {
      const start = f.start_offset_global ?? 0;
      const end = f.end_offset_global ?? start;
        const hasSaneGlobalOffsets =
          normalizedText != null &&
          start >= 0 &&
          end > start &&
          end <= normalizedText.length &&
          (end - start) <= MAX_EVIDENCE_SPAN;

        const modelSnippet = compactEvidenceText(f.evidence_snippet ?? "");
        const canonicalSnippet = hasSaneGlobalOffsets
          ? compactEvidenceText(normalizedText!.slice(start, end))
          : "";
        // Prefer canonical script text whenever offsets are sane so report evidence stays literal.
        const excerpt = canonicalSnippet.length > 0 ? canonicalSnippet : modelSnippet;
        const title_ar = normalizeMisusedGlossaryPassTitle({
          titleAr: f.title_ar,
          rationaleAr: f.rationale_ar ?? null,
          detectionPass: (f as { detection_pass?: string }).detection_pass ?? null,
          evidenceSnippet: excerpt,
          articleId: f.article_id,
        });
      const h = evidenceHash(
        f.article_id,
        f.atom_id ?? null,
        f.start_offset_global,
        f.end_offset_global,
        excerpt
      );
      return {
        job_id: jobId,
        script_id: scriptId,
        version_id: versionId,
        source: f.source ?? "ai",
        article_id: f.article_id,
        atom_id: f.atom_id ?? null,
        severity: f.severity,
        confidence: f.confidence,
        title_ar,
        description_ar: f.description_ar ?? "",
        evidence_snippet: excerpt,
        start_offset_global: f.start_offset_global,
        end_offset_global: f.end_offset_global,
        start_line_chunk: f.location?.start_line ?? null,
        end_line_chunk: f.location?.end_line ?? null,
        location: {
          ...f.location,
          run_key: runKey,
          v3: {
            depiction_type: f.depiction_type ?? "unknown",
            speaker_role: f.speaker_role ?? "unknown",
            context_window_id: f.context_window_id ?? null,
            context_confidence: f.context_confidence ?? null,
            lexical_confidence: f.lexical_confidence ?? null,
            policy_confidence: f.policy_confidence ?? null,
            rationale_ar: f.rationale_ar ?? null,
            final_ruling: f.final_ruling ?? null,
            narrative_consequence: f.narrative_consequence ?? "unknown",
            detection_pass: f.detection_pass ?? null,
            policy_links: f.policy_links ?? [],
            primary_article_id: (f as { primary_article_id?: number }).primary_article_id ?? f.article_id,
            related_article_ids: (f as { related_article_ids?: number[] }).related_article_ids ?? [],
            canonical_finding_id: (f as { canonical_finding_id?: string }).canonical_finding_id ?? null,
            pillar_id: (f as { pillar_id?: string }).pillar_id ?? null,
            secondary_pillar_ids: (f as { secondary_pillar_ids?: string[] }).secondary_pillar_ids ?? [],
          },
        },
        evidence_hash: h,
        rationale_ar: f.rationale_ar ?? null,
        canonical_atom: f.canonical_atom ?? null,
        intensity: f.intensity ?? null,
        context_impact: f.context_impact ?? null,
        legal_sensitivity: f.legal_sensitivity ?? null,
        audience_risk: f.audience_risk ?? null,
        page_number: pageNumAt(f.start_offset_global ?? 0),
        ...(() => {
          const s = f.start_offset_global ?? 0;
          const e = f.end_offset_global ?? s;
          const pl = computePageLocalSpan(s, e, pageRows);
          return {
            start_offset_page: pl.start_offset_page,
            end_offset_page: pl.end_offset_page,
          };
        })(),
      };
    });

    // Log first row shape for debugging column mismatch
    /* logger.info("AI findings upsert payload sample", ... ); */

    logger.info("AI findings upsert starting", {
      jobId,
      chunkId: chunk.id,
      runKey,
      rows: rows.length,
      timeoutMs: CRITICAL_DB_TIMEOUT_MS,
    });
    const { data, error } = await withOperationTimeout(
      "Upsert analysis_findings",
      CRITICAL_DB_TIMEOUT_MS,
      supabase
        .from("analysis_findings")
        .upsert(rows, { onConflict: "job_id,evidence_hash", ignoreDuplicates: true })
        .select("id,article_id,atom_id,confidence")
    );
    throwIfAborted(signal);

    logger.info("AI findings upsert result", {
      jobId, chunkId: chunk.id,
      attempted: rows.length,
      inserted: data?.length ?? 0,
      error: error ?? null,
    });

    if (error) {
      logger.error("AI findings upsert FAILED", {
        jobId, chunkId: chunk.id,
        error,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        errorCode: error.code,
      });
    } else {
      await upsertFindingPolicyLinks(
        (data ?? []).map((r) => ({
          id: (r as { id: string }).id,
          article_id: (r as { article_id: number }).article_id,
          atom_id: (r as { atom_id: string | null }).atom_id,
          confidence: (r as { confidence?: number | null }).confidence ?? 0,
        }))
      );
    }
    logger.info("Chunk insert timings", {
      jobId,
      chunkId: chunk.id,
      runKey,
      insertDurationMs: Date.now() - insertStartedAt,
      totalChunkDurationMs: Date.now() - chunkStartedAt,
      jobResourcesDurationMs,
    });
  } else {
    logger.info("No AI findings to insert for chunk", { jobId, chunkId: chunk.id, runKey });
  }

  throwIfAborted(signal);
  if (await isJobCancelled(jobId)) {
    await setChunkFailed(chunk.id, "Cancelled by user");
    throw new JobCancelledError();
  }
  await setChunkDone(chunk.id);
  await incrementJobProgress(jobId);
  logger.info("Chunk processed", {
    chunkId: chunk.id,
    runKey,
    findings: persistedFindings.length,
    totalChunkDurationMs: Date.now() - chunkStartedAt,
  });
}
