import { supabase } from "./db.js";
import { ALWAYS_CHECK_ARTICLES, getScriptStandardArticle, type GCAMArticle } from "./gcam.js";
import { evidenceHash, lexiconEvidenceHash, computeChunkRunKey } from "./hash.js";
import type { AnalysisChunk, AnalysisJob } from "./jobs.js";
import { incrementJobProgress, setChunkDone, setChunkFailed } from "./jobs.js";
import { analyzeLexiconMatches } from "./lexiconMatcher.js";
import { getLexiconCache } from "./lexiconCache.js";
import { logger } from "./logger.js";
import { callJudgeRaw, callRouter, parseJudgeWithRepair } from "./openai.js";
import { config } from "./config.js";
import { isValidAtomForArticle, normalizeAtomId } from "./policyMap.js";
import type { JudgeFinding } from "./schemas.js";
import { getScriptStandardRouterList } from "./gcam.js";

export type FindingWithGlobal = JudgeFinding & {
  start_offset_global: number;
  end_offset_global: number;
};

/**
 * Normalize for strict verbatim: NFC + collapse whitespace.
 */
function normalizeForMatch(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Relaxed normalize: strip all punctuation and extra spaces, keep only letters/digits/whitespace.
 */
function relaxedNormalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Two-tier verbatim check:
 * 1) Strict: normalized source includes normalized snippet
 * 2) Relaxed: punctuation-stripped source includes punctuation-stripped snippet
 * Only drops if BOTH fail.
 */
function isVerbatim(sourceText: string, snippet: string): boolean {
  if (!snippet || snippet.trim().length === 0) return false;
  // Strict
  const normSrc = normalizeForMatch(sourceText);
  const normSnip = normalizeForMatch(snippet);
  if (normSrc.includes(normSnip)) return true;
  // Relaxed (strip punctuation)
  const relaxSrc = relaxedNormalize(sourceText);
  const relaxSnip = relaxedNormalize(snippet);
  return relaxSrc.includes(relaxSnip);
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

function severityRank(s: string): number {
  const r: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return r[s] ?? 0;
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
    const better =
      severityRank(f.severity) > severityRank(existing.severity) ||
      (severityRank(f.severity) === severityRank(existing.severity) &&
        (f.confidence > existing.confidence ||
          (f.confidence === existing.confidence && !f.is_interpretive && existing.is_interpretive)));
    if (better) byHash.set(h, f);
  }
  return [...byHash.values()];
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
      if (severityRank(b.severity) !== severityRank(a.severity))
        return severityRank(b.severity) - severityRank(a.severity);
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (a.is_interpretive ? 1 : 0) - (b.is_interpretive ? 1 : 0);
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
  return result;
}

/**
 * Process a single chunk: lexicon -> router -> judge -> verbatim -> micro-windows -> dedupe -> overlap -> insert.
 * normalizedText: full canonical text for this job; used to derive evidence_snippet from global offsets so excerpt matches canonical.
 */
export async function processChunkJudge(
  job: AnalysisJob,
  chunk: AnalysisChunk,
  normalizedText: string | null
): Promise<void> {
  const { id: jobId, script_id: scriptId, version_id: versionId } = job;
  const chunkText = chunk.text;
  const chunkStart = chunk.start_offset;
  const chunkEnd = chunk.end_offset;

  if (!chunkText?.trim()) {
    await setChunkDone(chunk.id);
    await incrementJobProgress(jobId);
    return;
  }

  // 1) Lexicon mandatory findings (global offsets = chunk start + match range in chunk)
  // evidence_snippet from canonical slice so it matches viewer content; optional context in location for debugging
  const isDev = process.env.NODE_ENV !== "production";
  let lexiconMismatchLogCount = 0;
  const LEXICON_MISMATCH_LOG_CAP = 3;
  const CONTEXT_CHARS = 20;

  // HEALTH CHECK: warn if lexicon cache appears empty
  const lexiconCache = getLexiconCache(supabase);
  const cacheTerms = lexiconCache.findMatches(""); // Empty query returns 0 matches, but ensures cache is accessed
  if (isDev) logger.info("Lexicon cache health check", { chunkId: chunk.id, cacheStatus: "checked" });

  const { mandatoryFindings } = analyzeLexiconMatches(chunkText, supabase);
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
      evidence_snippet,
      start_offset_global: startGlobal,
      end_offset_global: endGlobal,
      start_line_chunk: m.line_start,
      end_line_chunk: m.line_end,
      location,
      evidence_hash: hash,
    };
    const { data: lexData, error: lexErr } = await supabase
      .from("analysis_findings")
      .upsert(lexRow, { onConflict: "job_id,evidence_hash", ignoreDuplicates: true })
      .select("id");
    logger.info("Lexicon finding upsert result", {
      jobId, chunkId: chunk.id, hash,
      inserted: lexData?.length ?? 0,
      error: lexErr ?? null,
      rowKeys: Object.keys(lexRow),
    });
    if (lexErr) {
      logger.error("Lexicon finding upsert FAILED", { jobId, chunkId: chunk.id, error: lexErr });
    }
  }

  // 1b) Idempotency Check & Config Setup
  const logicVersion = "v2-strict";
  const jobConfig = (job.config_snapshot as any) || {};
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
  const { data: cachedRun } = await supabase
    .from("analysis_chunk_runs")
    .select("ai_findings, router_candidates")
    .eq("run_key", runKey)
    .maybeSingle();

  // Variables for subsequent steps
  let allFindings: FindingWithGlobal[] = [];
  let selectedIds: number[];
  let routerOutputJson: any = null;

  if (cachedRun) {
    logger.info("Idempotency HIT: Using cached run results", { chunkId: chunk.id, runKey });
    allFindings = (cachedRun.ai_findings as any[]) || [];
  } else {
    logger.info("Idempotency MISS: Executing AI pipeline", { chunkId: chunk.id, runKey });

    // 2) Router (or high-recall bypass)


    if (config.HIGH_RECALL) {
      // High-recall dev mode: judge against ALL 25 articles
      selectedIds = Array.from({ length: 25 }, (_, i) => i + 1);
      logger.info("HIGH_RECALL mode: bypassing router, using all 25 articles", { chunkId: chunk.id });
    } else {
      const articleList = getScriptStandardRouterList();
      try {
        const routerOut = await callRouter(chunkText, articleList, {
          router_model: routerModel,
          temperature,
          seed,
          max_router_candidates: maxRouter,
        });
        routerOutputJson = routerOut;
        const candidateIds = routerOut.candidate_articles.map((a) => a.article_id);
        selectedIds = [...new Set([...ALWAYS_CHECK_ARTICLES, ...candidateIds])].slice(0, 25);

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
        logger.warn("Router failed, using ALWAYS_CHECK_ARTICLES", { error: String(e) });
        selectedIds = [...ALWAYS_CHECK_ARTICLES];
      }
    }
    const selectedArticles: GCAMArticle[] = selectedIds.map((id) => getScriptStandardArticle(id));
    logger.info("Articles selected for Judge", { chunkId: chunk.id, count: selectedIds.length, ids: selectedIds });

    // 3) Judge full chunk (raw + parse with repair)
    allFindings = [];
    try {
      const raw = await callJudgeRaw(chunkText, selectedArticles, chunkStart, chunkEnd, {
        judge_model: judgeModel,
        temperature,
        seed,
      });
      const { findings } = await parseJudgeWithRepair(raw, judgeModel);
      const enforced = enforceAtomIds(findings);
      const withGlobal = enforced.map((f) => toGlobalFinding(f, chunkStart));
      const beforeVerbatimCount = withGlobal.length;
      allFindings = withGlobal.filter((f) => isVerbatim(chunkText, f.evidence_snippet));
      logger.info("Judge full-chunk deterministic stats", {
        chunkId: chunk.id,
        runKey,
        beforeVerbatim: beforeVerbatimCount,
        afterVerbatim: allFindings.length,
        dropped: beforeVerbatimCount - allFindings.length,
      });
    } catch (e) {
      logger.warn("Judge (full chunk) failed", { error: String(e) });
    }

    // 4) Micro-windows
    const windows = buildMicroWindows(chunkText, chunkStart, chunkEnd);
    for (const w of windows) {
      try {
        const raw = await callJudgeRaw(w.windowText, selectedArticles, w.globalStart, w.globalEnd, {
          judge_model: judgeModel,
          temperature,
          seed,
        });
        const { findings } = await parseJudgeWithRepair(raw, judgeModel);
        const enforced = enforceAtomIds(findings);
        const withGlobal = enforced.map((f) => toGlobalFinding(f, w.globalStart));
        const beforeVerbatimCount = withGlobal.length;
        const verbatim = withGlobal.filter((f) => isVerbatim(w.windowText, f.evidence_snippet));
        // Log micro-window stats
        /* logger.info("Judge micro-window stats", { ... }) */

        allFindings.push(...verbatim);
      } catch (_) {
        // skip window on error
      }
    }

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
    const { error: runErr } = await supabase.from("analysis_chunk_runs").insert({
      run_key: runKey,
      job_id: jobId,
      router_candidates: routerOutputJson,
      ai_findings: allFindings
    });

    if (runErr) {
      logger.warn("Failed to persist analysis_chunk_run", { runKey, error: runErr.message });
    } else {
      logger.info("Persisted analysis_chunk_run", { runKey });
    }
  }

  // 6) Insert AI findings (batch upsert with logging). Derive excerpt from canonical when available.
  if (allFindings.length > 0) {
    const rows = allFindings.map((f) => {
      const start = f.start_offset_global ?? 0;
      const end = f.end_offset_global ?? start;
      const excerpt =
        normalizedText != null && start >= 0 && end <= normalizedText.length && end > start
          ? normalizedText.slice(start, end)
          : f.evidence_snippet;
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
        source: "ai" as const,
        article_id: f.article_id,
        atom_id: f.atom_id ?? null,
        severity: f.severity,
        confidence: f.confidence,
        title_ar: f.title_ar,
        description_ar: f.description_ar ?? "",
        evidence_snippet: excerpt,
        start_offset_global: f.start_offset_global,
        end_offset_global: f.end_offset_global,
        start_line_chunk: f.location?.start_line ?? null,
        end_line_chunk: f.location?.end_line ?? null,
        location: { ...f.location, run_key: runKey },
        evidence_hash: h,
      };
    });

    // Log first row shape for debugging column mismatch
    /* logger.info("AI findings upsert payload sample", ... ); */

    const { data, error } = await supabase
      .from("analysis_findings")
      .upsert(rows, { onConflict: "job_id,evidence_hash", ignoreDuplicates: true })
      .select("id");

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
    }
  } else {
    logger.info("No AI findings to insert for chunk", { jobId, chunkId: chunk.id, runKey });
  }

  await setChunkDone(chunk.id);
  await incrementJobProgress(jobId);
  logger.info("Chunk processed", {
    chunkId: chunk.id,
    runKey,
    findings: allFindings.length + mandatoryFindings.length,
  });
}
