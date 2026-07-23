import { z } from "zod";

import { buildIntelligenceContext } from "../analysisEngineV3/intelligence/intelligenceBuilder.js";
import { resolveUniversalConceptsFromRecognitionInput } from "../analysisEngineV3/concepts/universalConceptResolver.js";
import { createV3ProviderFactory } from "../analysisEngineV3/provider/providerFactory.js";
import { createLegalDecision } from "../analysisEngineV3/legal/legalDecision.js";
import type { LegalContextResult, LegalEvidenceCandidate, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../analysisEngineV3/legal/legalTypes.js";
import type { IntelligenceContext } from "../analysisEngineV3/intelligence/intelligenceContext.js";
import { getCachedJobResources } from "../jobAnalysisCache.js";
import { buildReviewerAcademyKnowledgePrompt } from "../reviewerAcademy/articleKnowledgeRenderer.js";
import { createDefaultReviewerKnowledgeRegistry, resolveKnowledgeDomainCandidateArticleIds } from "../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { getPolicyArticle, getPolicyAtomIdsForArticle, getPolicyAtomTitle, derivePolicyConceptCode, isValidAtomForArticle, normalizeAtomId } from "../policyMap.js";
import { getPrimaryCanonicalAtomForGcam } from "../canonicalAtomMapping.js";
import { ensureFindingLineageId } from "../findingLineage.js";
import { offsetToPageNumber } from "../offsetToPage.js";
import { canonicalStringify } from "../canonicalJson.js";
import { sha256 } from "../hash.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { supabase } from "../db.js";
import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "./types.js";
import type { V3RuntimeFinding } from "../analysisEngineV3/runtime/runtimeTypes.js";
import { extractJsonFromText } from "../schemas.js";
import type { V3StageHash, V3StageTiming } from "../analysisEngineV3/pipeline/pipelineTypes.js";

type ReviewCoreRawFinding = Readonly<{
  articleId?: number | string | null;
  atomId?: string | number | null;
  quotedText?: string | null;
  startOffset?: number | string | null;
  endOffset?: number | string | null;
  reason?: string | null;
  confidence?: number | string | null;
}>;

function readRawFindingField(value: ReviewCoreRawFinding, key: keyof ReviewCoreRawFinding): string | number | null {
  const field = value[key];
  if (field == null) return null;
  if (typeof field === "string" || typeof field === "number") return field;
  return null;
}

type ReviewCoreRawOutput = Readonly<{
  findings?: readonly ReviewCoreRawFinding[] | null;
}>;

type ReviewCoreDependencies = Readonly<{
  providerFactory?: ReturnType<typeof createV3ProviderFactory>;
  selectArticleIds?: (jobContext: AnalysisJobContext, intelligence: IntelligenceContext, knowledgeDomains: readonly string[]) => readonly number[];
  getJobResources?: typeof getCachedJobResources;
  now?: () => number;
}>;

type ReviewCorePromptBuild = Readonly<{
  articleId: number;
  systemPrompt: string;
  userPrompt: string;
  promptCharacterCount: number;
  promptTokenEstimate: number;
  knowledgePrompt: ReturnType<typeof buildReviewerAcademyKnowledgePrompt>;
}>;

const DEFAULT_REVIEWER_KNOWLEDGE_REGISTRY = createDefaultReviewerKnowledgeRegistry();
const EMPTY_GLOSSARY = Object.freeze({
  title: "Review Core Glossary",
  entries: Object.freeze([]),
  notes: Object.freeze([]),
});

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function clampOffset(value: number | string | null | undefined, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.floor(numeric);
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.7;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return Number(numeric.toFixed(6));
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort(compareNumbers));
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function buildSelectionNarrative(input: AnalysisJobContext["request"]): LegalNarrativeResult {
  const chunkText = input.chunkText;
  return Object.freeze({
    speaker: null,
    listener: null,
    target: null,
    narrativeVoice: "unknown",
    sceneType: chunkText.includes(":") ? "dialogue" : "unknown",
    narrativeIntent: "unknown",
    storyPosition: "unknown",
    relationship: null,
    emotionalTone: "unknown",
    condemnation: null,
    approval: null,
    neutrality: true,
    historicalContext: false,
    dream: false,
    flashback: false,
    comedy: false,
    satire: false,
    threat: false,
    instruction: false,
    news: false,
    documentary: false,
    dialogue: chunkText.includes(":"),
    narration: !chunkText.includes(":"),
    sceneDescription: !chunkText.includes(":"),
    confidence: 0.5,
    notes: Object.freeze(["Review core selection narrative"]),
  });
}

function buildSelectionEvidence(request: AnalysisJobContext["request"]): LegalEvidenceResult {
  return Object.freeze({
    candidates: Object.freeze([Object.freeze({
      text: request.chunkText,
      startOffset: request.chunkStart,
      endOffset: request.chunkEnd,
      confidence: 1,
      source: "chunk",
      notes: Object.freeze(["chunk evidence"]),
    })]),
    primaryCandidateIndex: 0,
    admissible: true,
    confidence: 1,
    notes: Object.freeze(["review core selection evidence"]),
  });
}

function buildSelectionSemantic(request: AnalysisJobContext["request"]): LegalSemanticResult {
  return Object.freeze({
    semanticMeaning: request.chunkText,
    narrativeIntent: "unknown",
    conversationRole: "unknown",
    sceneRole: "unknown",
    speaker: null,
    listener: null,
    target: null,
    victim: null,
    emotion: null,
    riskContext: null,
    confidence: 0.5,
    notes: Object.freeze(["review core selection semantic"]),
  });
}

function buildSelectionContext(request: AnalysisJobContext["request"]): LegalContextResult {
  const memorySummary = [request.analysisPromptContext, request.storyMemory, request.sceneMemory].filter((value): value is string => Boolean(value && value.trim().length > 0)).join("\n\n");
  return Object.freeze({
    storyMemory: request.storyMemory ?? null,
    sceneMemory: request.sceneMemory ?? null,
    localContext: request.chunkText,
    chunkContext: request.chunkText,
    neighboringSentences: Object.freeze([...request.neighboringSentences]),
    narrativeContext: memorySummary || "unknown",
    confidence: 0.5,
    notes: Object.freeze(["review core selection context"]),
  });
}

function buildSelectionIntelligenceContext(request: AnalysisJobContext["request"]): IntelligenceContext {
  return buildIntelligenceContext({
    moduleId: "review_core_selection",
    storyMemory: request.storyMemory ?? null,
    narrative: buildSelectionNarrative(request),
    evidence: buildSelectionEvidence(request),
    semantic: buildSelectionSemantic(request),
    context: buildSelectionContext(request),
    glossary: EMPTY_GLOSSARY,
  });
}

function selectArticleIdsForChunk(
  jobContext: AnalysisJobContext,
  intelligence: IntelligenceContext,
): Readonly<{
  knowledgeDomains: readonly string[];
  articleIds: readonly number[];
  reason: string;
  confidence: number;
}> {
  const { conceptContext: _conceptContext, ...conceptInput } = intelligence;
  const resolution = resolveUniversalConceptsFromRecognitionInput(conceptInput);
  const selectedArticleIds = new Set<number>();

  for (const domain of resolution.knowledgeDomains) {
    for (const articleId of resolveKnowledgeDomainCandidateArticleIds(DEFAULT_REVIEWER_KNOWLEDGE_REGISTRY, domain)) {
      selectedArticleIds.add(articleId);
    }
  }

  if (selectedArticleIds.size === 0) {
    selectedArticleIds.add(1);
  }

  const articleIds = uniqueSortedNumbers([...selectedArticleIds]);
  return Object.freeze({
    knowledgeDomains: resolution.knowledgeDomains,
    articleIds,
    reason: resolution.reason,
    confidence: resolution.confidence,
  });
}

function buildMemorySummary(jobContext: AnalysisJobContext): string {
  return [
    jobContext.request.analysisPromptContext?.trim() ?? "",
    jobContext.request.storyMemory?.trim() ?? "",
    jobContext.request.sceneMemory?.trim() ?? "",
  ].filter(Boolean).join("\n\n");
}

function buildReviewCorePrompt(articleId: number, jobContext: AnalysisJobContext, memorySummary: string): ReviewCorePromptBuild {
  const articleToken = `article_${String(articleId).padStart(2, "0")}`;
  const handbook = buildReviewerAcademyKnowledgePrompt([articleToken]);
  const systemPrompt = [
    "# Review Core System Prompt",
    "You are the official reviewer responsible for this GCAM article.",
    "Follow ONLY the Universal Review Protocol and the article handbook below.",
    "Do not synthesize additional policy text.",
    "Do not infer outside the provided handbook and screenplay chunk.",
    "Return JSON only with the shape {\"findings\":[{\"articleId\":number,\"atomId\":string|null,\"quotedText\":string,\"startOffset\":number,\"endOffset\":number,\"reason\":string,\"confidence\"?:number}]}",
    handbook.section,
  ].join("\n\n");
  const userPrompt = [
    "# Chunk",
    `jobId: ${jobContext.request.jobId}`,
    `chunkId: ${jobContext.request.chunkId}`,
    `scriptId: ${jobContext.request.scriptId}`,
    `versionId: ${jobContext.request.versionId}`,
    `chunkIndex: ${jobContext.request.chunkIndex}`,
    `chunkStart: ${jobContext.request.chunkStart}`,
    `chunkEnd: ${jobContext.request.chunkEnd}`,
    memorySummary.trim().length > 0 ? `Memory2 Summary:\n${memorySummary}` : "Memory2 Summary:\n(none)",
    "Chunk Text:",
    jobContext.request.chunkText,
    "Return findings only for the selected article.",
  ].join("\n\n");

  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  return Object.freeze({
    articleId,
    systemPrompt,
    userPrompt,
    promptCharacterCount: prompt.length,
    promptTokenEstimate: estimateTokens(prompt),
    knowledgePrompt: handbook,
  });
}

function parseReviewCoreOutput(rawResponse: string): readonly ReviewCoreRawFinding[] {
  const jsonText = extractJsonFromText(rawResponse);
  if (jsonText.trim().length === 0) return Object.freeze([]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Review core response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as ReviewCoreRawOutput).findings)
      ? ((parsed as ReviewCoreRawOutput).findings ?? [])
      : [];

  return Object.freeze(
    list
      .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
      .map((value) => Object.freeze({
        articleId: (typeof value.articleId === "number" || typeof value.articleId === "string" ? value.articleId : (typeof value.article_id === "number" || typeof value.article_id === "string" ? value.article_id : null)),
        atomId: (typeof value.atomId === "number" || typeof value.atomId === "string" ? value.atomId : (typeof value.atom_id === "number" || typeof value.atom_id === "string" ? value.atom_id : null)),
        quotedText: (typeof value.quotedText === "string" ? value.quotedText : (typeof value.quoted_text === "string" ? value.quoted_text : null)),
        startOffset: (typeof value.startOffset === "number" || typeof value.startOffset === "string" ? value.startOffset : (typeof value.start_offset === "number" || typeof value.start_offset === "string" ? value.start_offset : null)),
        endOffset: (typeof value.endOffset === "number" || typeof value.endOffset === "string" ? value.endOffset : (typeof value.end_offset === "number" || typeof value.end_offset === "string" ? value.end_offset : null)),
        reason: (typeof value.reason === "string" ? value.reason : (typeof value.rationale === "string" ? value.rationale : null)),
        confidence: (typeof value.confidence === "number" || typeof value.confidence === "string" ? value.confidence : null),
      } as const)),
  );
}

function findSpanInChunk(chunkText: string, quotedText: string | null | undefined, startOffset: number, endOffset: number): Readonly<{ quotedText: string; startOffset: number; endOffset: number } | null> {
  const normalizedQuote = typeof quotedText === "string" ? quotedText.trim() : "";
  const candidateStart = Math.max(0, Math.min(startOffset, chunkText.length));
  const candidateEnd = Math.max(candidateStart, Math.min(endOffset, chunkText.length));
  if (candidateEnd > candidateStart) {
    const slice = chunkText.slice(candidateStart, candidateEnd);
    if (!normalizedQuote || slice === normalizedQuote) {
      return Object.freeze({
        quotedText: normalizedQuote || slice,
        startOffset: candidateStart,
        endOffset: candidateEnd,
      });
    }
  }

  if (normalizedQuote.length > 0) {
    const quoteIndex = chunkText.indexOf(normalizedQuote);
    if (quoteIndex >= 0) {
      return Object.freeze({
        quotedText: normalizedQuote,
        startOffset: quoteIndex,
        endOffset: quoteIndex + normalizedQuote.length,
      });
    }
  }

  return null;
}

function computeLineNumber(chunkText: string, baseLine: number | null | undefined, offset: number): number | null {
  if (!Number.isFinite(offset) || offset < 0 || typeof baseLine !== "number" || !Number.isFinite(baseLine)) {
    return null;
  }
  const prefix = chunkText.slice(0, Math.max(0, Math.min(offset, chunkText.length)));
  const lineBreakCount = (prefix.match(/\n/g) ?? []).length;
  return baseLine + lineBreakCount;
}

function buildFindingLocation(
  request: AnalysisJobContext["request"],
  pageRows: readonly { page_number: number; content: string }[],
  globalStart: number,
  globalEnd: number,
  articleId: number,
  promptHash: string,
  semanticHash: string,
  legalHash: string,
  rawResponseHash: string,
  responseId: string | null,
  responseTimestamp: string | null,
  findingCount: number,
): Record<string, unknown> {
  const page = offsetToPageNumber(globalStart, [...pageRows]) ?? null;
  const knowledgeDocument = getPolicyArticle(articleId);
  const pageInfo = page == null ? null : pageRows.find((row) => row.page_number === page) ?? null;
  return {
    start_offset: globalStart,
    end_offset: globalEnd,
    start_line: computeLineNumber(request.chunkText, request.startLine, globalStart - request.chunkStart),
    end_line: computeLineNumber(request.chunkText, request.startLine, globalEnd - request.chunkStart),
    page,
    v3: {
      engine_version: "review_core",
      prompt_hash: promptHash,
      semantic_hash: semanticHash,
      legal_hash: legalHash,
      raw_response_hash: rawResponseHash,
      provider_name: "openai",
      model_name: config.OPENAI_JUDGE_MODEL,
      model_version: null,
      response_id: responseId,
      response_timestamp: responseTimestamp,
      finding_count: findingCount,
      category: "review_core",
      reviewer_metadata: {
        reviewed_by: null,
        reviewed_at: null,
        edited_by: null,
        edited_at: null,
      },
      knowledge_registry: knowledgeDocument
        ? {
            article_reference: `article_${String(articleId).padStart(2, "0")}`,
            knowledge_domain: knowledgeDocument.title_ar ?? null,
            review_type: "review_core",
            primary_evidence: pageInfo?.content?.slice(0, 80) ?? null,
            title: knowledgeDocument.title_ar ?? null,
            file_name: `article_${String(articleId).padStart(2, "0")}.md`,
            source_path: `apps/worker/knowledge/article_${String(articleId).padStart(2, "0")}.md`,
            metadata_source: "knowledgeManifest.json",
          }
        : null,
    },
  };
}

function inferSeverity(confidence: number): V3RuntimeFinding["severity"] {
  if (confidence >= 0.95) return "high";
  if (confidence >= 0.8) return "medium";
  return "low";
}

function getFindingPage(finding: V3RuntimeFinding): number | null {
  const page = (finding as unknown as { location?: { page?: number | null } }).location?.page;
  return Number.isFinite(page as number) ? Number(page) : null;
}

function enrichFinding(
  jobContext: AnalysisJobContext,
  articleId: number,
  pageRows: readonly { page_number: number; content: string }[],
  rawFinding: ReviewCoreRawFinding,
  promptHash: string,
  semanticHash: string,
  legalHash: string,
  rawResponseHash: string,
  responseId: string | null,
  responseTimestamp: string | null,
): V3RuntimeFinding | null {
  const selectedArticle = getPolicyArticle(articleId);
  if (!selectedArticle) return null;

  const rawArticleId = Number(rawFinding.articleId ?? articleId);
  if (Number.isFinite(rawArticleId) && rawArticleId !== articleId) {
    logger.warn("[ReviewCore] Rejected raw finding with mismatched article id", {
      jobId: jobContext.request.jobId,
      chunkId: jobContext.request.chunkId,
      selectedArticleId: articleId,
      rawArticleId,
    });
    return null;
  }

  const normalizedAtomId = normalizeAtomId(rawFinding.atomId ?? null, articleId) || getPolicyAtomIdsForArticle(articleId)[0] || null;
  if (normalizedAtomId && !isValidAtomForArticle(articleId, normalizedAtomId)) {
    logger.warn("[ReviewCore] Rejected raw finding with invalid atom id", {
      jobId: jobContext.request.jobId,
      chunkId: jobContext.request.chunkId,
      selectedArticleId: articleId,
      atomId: normalizedAtomId,
    });
    return null;
  }

  const span = findSpanInChunk(
    jobContext.request.chunkText,
    rawFinding.quotedText,
    clampOffset(rawFinding.startOffset, 0),
    clampOffset(rawFinding.endOffset, 0),
  );
  if (!span) {
    logger.warn("[ReviewCore] Rejected raw finding with no grounded quote", {
      jobId: jobContext.request.jobId,
      chunkId: jobContext.request.chunkId,
      selectedArticleId: articleId,
      quotedText: rawFinding.quotedText ?? null,
      startOffset: rawFinding.startOffset ?? null,
      endOffset: rawFinding.endOffset ?? null,
    });
    return null;
  }

  const globalStart = jobContext.request.chunkStart + span.startOffset;
  const globalEnd = jobContext.request.chunkStart + span.endOffset;
  const atomTitle = normalizedAtomId ? getPolicyAtomTitle(articleId, normalizedAtomId) ?? null : null;
  const canonicalAtom = getPrimaryCanonicalAtomForGcam(articleId, normalizedAtomId);
  const evidenceText = span.quotedText;
  const confidence = clampConfidence(rawFinding.confidence);
  const finding = {
    source: "review_core",
    exists: true,
    article_id: articleId,
    atom_id: normalizedAtomId,
    severity: inferSeverity(confidence),
    confidence,
    title_ar: selectedArticle.title_ar,
    description_ar: atomTitle ?? (String(rawFinding.reason ?? "").trim() || selectedArticle.title_ar),
    evidence_snippet: evidenceText,
    rationale_ar: String(rawFinding.reason ?? "").trim(),
    exceptionApplied: false,
    exceptionType: null,
    exceptionReason: null,
    recommendedAction: "Approve",
    legalRecommendation: "Approve",
    final_ruling: "violation",
    detection_pass: `review_core_${String(articleId).padStart(2, "0")}`,
    location: buildFindingLocation(
      jobContext.request,
      pageRows,
      globalStart,
      globalEnd,
      articleId,
      promptHash,
      semanticHash,
      legalHash,
      rawResponseHash,
      responseId,
      responseTimestamp,
      0,
    ),
    start_offset_global: globalStart,
    end_offset_global: globalEnd,
    canonical_atom: canonicalAtom ?? derivePolicyConceptCode(articleId, normalizedAtomId),
    lineage_id: null,
    parent_lineage_id: null,
    evidence_hash: null,
    canonical_hash: null,
    is_interpretive: false,
    depiction_type: "unknown",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: confidence,
    lexical_confidence: confidence,
    policy_confidence: confidence,
    policy_links: [
      {
        article_id: articleId,
        atom_concept_id: canonicalAtom ?? null,
        role: "primary",
      },
    ],
    primary_article_id: articleId,
    related_article_ids: Object.freeze([articleId]),
  } as unknown as V3RuntimeFinding;

  ensureFindingLineageId(finding, {
    jobId: jobContext.request.jobId,
    chunkId: jobContext.request.chunkId,
    passName: finding.detection_pass ?? "review_core",
  });
  Object.assign(finding as Record<string, unknown>, { canonical_finding_id: finding.lineage_id ?? null });

  return finding;
}

function dedupeFindings(findings: readonly V3RuntimeFinding[]): readonly V3RuntimeFinding[] {
  const unique: V3RuntimeFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.article_id,
      getFindingPage(finding),
      finding.start_offset_global,
      finding.end_offset_global,
      normalizeText(finding.evidence_snippet ?? ""),
    ].join("|");
    const overlaps = unique.some((existing) =>
      existing.article_id === finding.article_id
      && getFindingPage(existing) === getFindingPage(finding)
      && Math.max(existing.start_offset_global, finding.start_offset_global) < Math.min(existing.end_offset_global, finding.end_offset_global),
    );
    if (!overlaps && !unique.some((existing) => [
      existing.article_id,
      getFindingPage(existing),
      existing.start_offset_global,
      existing.end_offset_global,
      normalizeText(existing.evidence_snippet ?? ""),
    ].join("|") === key)) {
      unique.push(finding);
    }
  }
  return Object.freeze(unique);
}

export function createAnalysisEngineReviewCoreAdapter(dependencies: ReviewCoreDependencies = {}): AnalysisEngine {
  return Object.freeze({
    async execute(jobContext: AnalysisJobContext): Promise<AnalysisResult> {
      const startedAt = Date.now();
      logger.info("[ReviewCore] analysisEngine entered", {
        jobId: jobContext.request.jobId,
        chunkId: jobContext.request.chunkId,
      });

      const provider = dependencies.providerFactory?.create("openai") ?? createV3ProviderFactory().create("openai");
      const getJobResources = dependencies.getJobResources ?? getCachedJobResources;
      const { pageRows } = await getJobResources(supabase, jobContext.request.jobId, jobContext.request.versionId);
      const intelligence = buildSelectionIntelligenceContext(jobContext.request);
      const selection = selectArticleIdsForChunk(jobContext, intelligence);
      const selectedArticleIds = uniqueSortedNumbers(
        dependencies.selectArticleIds?.(jobContext, intelligence, selection.knowledgeDomains) ?? selection.articleIds,
      );
      const memorySummary = buildMemorySummary(jobContext);
      const articleReviews: Array<Readonly<{
        articleId: number;
        promptHash: string;
        promptCharacterCount: number;
        promptTokenEstimate: number;
        rawFindingCount: number;
        acceptedFindingCount: number;
        rawResponseHash: string;
        responseId: string | null;
        responseTimestamp: string | null;
      }>> = [];
      const findingsByArticle: V3RuntimeFinding[] = [];
      const stageTimings: V3StageTiming[] = [];
      const stageHashes: V3StageHash[] = [];

      let selectionStageStarted = Date.now();
      stageHashes.push(Object.freeze({ stage: "narrative", hash: sha256(canonicalStringify({ knowledgeDomains: selection.knowledgeDomains, selectedArticleIds })) }));
      stageTimings.push(Object.freeze({ stage: "narrative", durationMs: Date.now() - selectionStageStarted }));

      selectionStageStarted = Date.now();
      stageHashes.push(Object.freeze({ stage: "evidence", hash: sha256(canonicalStringify({ memorySummary, chunkId: jobContext.request.chunkId, chunkHash: sha256(jobContext.request.chunkText) })) }));
      stageTimings.push(Object.freeze({ stage: "evidence", durationMs: Date.now() - selectionStageStarted }));

      const rawResponses: Array<{ articleId: number; rawResponse: string; rawResponseHash: string; responseId: string | null; responseTimestamp: string | null; promptHash: string; }> = [];

      for (const articleId of selectedArticleIds) {
        const promptStartedAt = Date.now();
        const prompt = buildReviewCorePrompt(articleId, jobContext, memorySummary);
        stageHashes.push(Object.freeze({ stage: "semantic", hash: sha256(canonicalStringify({ articleId, promptHash: prompt.promptCharacterCount, articleFilePaths: prompt.knowledgePrompt.filePaths })) }));
        stageTimings.push(Object.freeze({ stage: "semantic", durationMs: Date.now() - promptStartedAt }));

        const rawResponse = await provider.callJudgeRaw({
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          modelName: config.OPENAI_JUDGE_MODEL,
          temperature: 0,
          topP: 1,
          seed: 12345,
          maxTokens: 2048,
          promptTokenEstimate: prompt.promptTokenEstimate,
          retryAttempt: 0,
          responseFormat: "json_object",
        });

        const rawResponseHash = sha256(rawResponse.rawResponse);
        rawResponses.push({
          articleId,
          rawResponse: rawResponse.rawResponse,
          rawResponseHash,
          responseId: rawResponse.responseId,
          responseTimestamp: rawResponse.responseTimestamp,
          promptHash: sha256(canonicalStringify({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt })),
        });

        let parsedFindings: readonly ReviewCoreRawFinding[] = Object.freeze([]);
        try {
          parsedFindings = parseReviewCoreOutput(rawResponse.rawResponse);
        } catch (error) {
          logger.warn("[ReviewCore] Failed to parse reviewer response", {
            jobId: jobContext.request.jobId,
            chunkId: jobContext.request.chunkId,
            articleId,
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        const articleFindingCount = parsedFindings.length;
        const articleFindings: V3RuntimeFinding[] = [];
        for (const rawFinding of parsedFindings) {
          const enriched = enrichFinding(
            jobContext,
            articleId,
            pageRows,
            rawFinding,
            rawResponses[rawResponses.length - 1]?.promptHash ?? prompt.promptTokenEstimate.toString(),
            sha256(canonicalStringify(selection.knowledgeDomains)),
            sha256(canonicalStringify({ articleId, memorySummary })),
            rawResponseHash,
            rawResponse.responseId,
            rawResponse.responseTimestamp,
          );
          if (enriched) {
            articleFindings.push(enriched);
            findingsByArticle.push(enriched);
          }
        }

        articleReviews.push(Object.freeze({
          articleId,
          promptHash: rawResponses[rawResponses.length - 1]?.promptHash ?? sha256(canonicalStringify({ articleId, jobId: jobContext.request.jobId })),
          promptCharacterCount: prompt.promptCharacterCount,
          promptTokenEstimate: prompt.promptTokenEstimate,
          rawFindingCount: articleFindingCount,
          acceptedFindingCount: articleFindings.length,
          rawResponseHash,
          responseId: rawResponse.responseId,
          responseTimestamp: rawResponse.responseTimestamp,
        }));
      }

      const dedupedFindings = dedupeFindings(findingsByArticle);
      stageHashes.push(Object.freeze({ stage: "context", hash: sha256(canonicalStringify(articleReviews.map((review) => ({ articleId: review.articleId, acceptedFindingCount: review.acceptedFindingCount })))) }));
      stageTimings.push(Object.freeze({ stage: "context", durationMs: 0 }));
      stageHashes.push(Object.freeze({ stage: "intelligence", hash: sha256(canonicalStringify(dedupedFindings.map((finding) => ({
        article_id: finding.article_id,
        atom_id: finding.atom_id,
        canonical_atom: finding.canonical_atom,
        evidence_snippet: finding.evidence_snippet,
        start_offset_global: finding.start_offset_global,
        end_offset_global: finding.end_offset_global,
      })))) }));
      stageTimings.push(Object.freeze({ stage: "intelligence", durationMs: 0 }));
      stageHashes.push(Object.freeze({ stage: "legal", hash: sha256(canonicalStringify({ findings: dedupedFindings.length, articleIds: selectedArticleIds })) }));
      stageTimings.push(Object.freeze({ stage: "legal", durationMs: Date.now() - startedAt }));

      const promptHash = sha256(canonicalStringify({ jobId: jobContext.request.jobId, chunkId: jobContext.request.chunkId, reviews: articleReviews }));
      const semanticHash = sha256(canonicalStringify({ knowledgeDomains: selection.knowledgeDomains, intelligence: intelligence.conceptContext.conceptIds }));
      const legalHash = sha256(canonicalStringify(dedupedFindings.map((finding) => ({
        articleId: finding.article_id,
        atomId: finding.atom_id,
        evidence: finding.evidence_snippet,
        rationale: finding.rationale_ar,
      }))));
      const rawResponseHash = sha256(canonicalStringify(rawResponses.map((response) => ({
        articleId: response.articleId,
        hash: response.rawResponseHash,
      }))));

      const narrative = buildSelectionNarrative(jobContext.request);
      const evidence = buildSelectionEvidence(jobContext.request);
      const semantic = buildSelectionSemantic(jobContext.request);
      const context = buildSelectionContext(jobContext.request);
      const legalDecision = createLegalDecision({
        moduleId: "review_core",
        moduleTitle: "Review Core",
        articleIds: selectedArticleIds,
        applies: dedupedFindings.length > 0,
        status: dedupedFindings.length > 0 ? "accept" : "reject",
        reason: selection.reason,
        confidence: selection.confidence,
        semantic,
        narrative,
        evidence,
        context,
        exceptions: [],
        finding: null,
        trace: selectedArticleIds.map((articleId) => `review_core:${articleId}`),
      });

      const analysisResponse = Object.freeze({
        promptHash,
        semanticHash,
        legalHash,
        stageHashes: Object.freeze(stageHashes),
        stageTimings: Object.freeze(stageTimings),
        narrative,
        evidence,
        semantic,
        context,
        intelligence,
        legalDecision,
        diagnostics: Object.freeze({
          executionOrder: ["build_prompt", "reasoning_pipeline", "semantic_layer", "intelligence_layer", "legal_engine", "module_evaluation", "analysis_response"] as const,
          promptHash,
          semanticHash,
          legalHash,
          stageHashes: Object.freeze(stageHashes),
          stageTimings: Object.freeze(stageTimings),
        }),
      });

      const diagnostics = Object.freeze({
        engineVersion: "review_core" as const,
        providerName: "openai",
        modelName: config.OPENAI_JUDGE_MODEL,
        modelVersion: null,
        rawResponseHash,
        responseId: rawResponses[0]?.responseId ?? null,
        responseTimestamp: rawResponses[0]?.responseTimestamp ?? null,
        promptHash,
        semanticHash,
        legalHash,
        executionSignatureHash: null,
        stageHashes: Object.freeze(stageHashes),
        stageTimings: Object.freeze(stageTimings),
        subjectModuleId: "review_core",
        chunkHash: sha256(jobContext.request.chunkText),
        findingCount: dedupedFindings.length,
      });

      const truthLayerMeta = Object.freeze({
        architecture: "review_core_adapter",
        engine_version: "review_core",
        job_id: jobContext.request.jobId,
        chunk_id: jobContext.request.chunkId,
        selected_article_ids: selectedArticleIds,
        knowledge_domains: selection.knowledgeDomains,
        article_reviews: articleReviews,
        prompt_character_count: articleReviews.reduce((total, review) => total + review.promptCharacterCount, 0),
        prompt_token_estimate: articleReviews.reduce((total, review) => total + review.promptTokenEstimate, 0),
        raw_response_count: rawResponses.length,
        finding_count: dedupedFindings.length,
      });

      logger.info("[ReviewCore] analysisEngine exited", {
        jobId: jobContext.request.jobId,
        chunkId: jobContext.request.chunkId,
        durationMs: Date.now() - startedAt,
        selectedArticleIds,
        findingCount: dedupedFindings.length,
      });

      return Object.freeze({
        analysisResponse,
        findings: dedupedFindings,
        diagnostics,
        truthLayerMeta,
      }) as unknown as AnalysisResult;
    },
  });
}

export type { ReviewCoreDependencies };
