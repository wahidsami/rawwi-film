import type { LegalContextResult, LegalEvidenceCandidate, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";
import type { V3PromptJsonObject, V3PromptJsonValue } from "../builder/builderTypes.js";
import type { V3ReasonedDecisionArticleEvaluation, V3ReasonedDecisionResult, V3ReasoningResponsePayload } from "./providerTypes.js";
import { logger } from "../../logger.js";

const EXPECTED_TOP_LEVEL_KEYS = Object.freeze([
  "narrative",
  "narrative_result",
  "narrativeResult",
  "evidence",
  "evidence_result",
  "evidenceResult",
  "semantic",
  "semantic_result",
  "semanticResult",
  "context",
  "context_result",
  "contextResult",
  "reasoned_decision",
  "reasonedDecision",
  "reasoned_decision_result",
  "reasonedDecisionResult",
  "reasoning",
  "metadata",
] as const);

const EXPECTED_SECTION_KEYS = Object.freeze([
  "narrative",
  "narrative_result",
  "narrativeResult",
  "evidence",
  "evidence_result",
  "evidenceResult",
  "semantic",
  "semantic_result",
  "semanticResult",
  "context",
  "context_result",
  "contextResult",
] as const);

const EXPECTED_REASONED_DECISION_KEYS = Object.freeze([
  "reasoning",
  "why",
  "alternativeInterpretations",
  "alternative_interpretations",
  "confidence",
  "articleEvaluations",
  "article_evaluations",
  "supportingEvidence",
  "supporting_evidence",
  "contradictingEvidence",
  "contradicting_evidence",
  "applicableArticles",
  "applicable_articles",
  "rejectedArticles",
  "rejected_articles",
  "riskAnalysis",
  "risk_analysis",
  "narrativeAnalysis",
  "narrative_analysis",
  "humanLikeExplanation",
  "human_like_explanation",
  "recommendation",
  "recommendation_result",
  "recommendationResult",
] as const);

export type V3ProviderResponseDiscardedField = Readonly<{
  path: string;
  value: V3PromptJsonValue;
}>;

export type V3ProviderResponseParseFailure = Readonly<{
  message: string;
  position: number | null;
  line: number | null;
  column: number | null;
}>;

export type V3ProviderResponseParseAudit = Readonly<{
  rawResponse: string;
  extractedJsonText: string;
  parseErrors: readonly string[];
  parseFailure: V3ProviderResponseParseFailure | null;
  parserInput: Readonly<{
    parsedJson: V3PromptJsonValue | null;
    payloadSource: "root" | "reasoning";
    parseStrategy: "root" | "reasoning";
    fallbackParserUsed: boolean;
    fallbackParserName: string | null;
    topLevelKeys: readonly string[];
    payloadKeys: readonly string[];
    expectedTopLevelKeys: readonly string[];
    expectedSectionKeys: readonly string[];
    expectedReasonedDecisionKeys: readonly string[];
  }>;
  discardedFields: readonly V3ProviderResponseDiscardedField[];
  parserOutput: Readonly<{
    narrative: LegalNarrativeResult;
    evidence: LegalEvidenceResult;
    semantic: LegalSemanticResult;
    context: LegalContextResult;
    reasonedDecision: V3ReasonedDecisionResult;
  }>;
  finalReasonedDecision: V3ReasonedDecisionResult;
  parsedFindingCount: number;
  zeroFindingsReason: string | null;
}>;

function isObject(value: unknown): value is V3PromptJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectKeys(value: unknown): readonly string[] {
  return isObject(value) ? Object.keys(value) : [];
}

function extractJsonWithDiagnostics(raw: string): Readonly<{
  extractedJsonText: string;
  parsedJson: V3PromptJsonValue | null;
  parseErrors: readonly string[];
  parseFailure: V3ProviderResponseParseFailure | null;
}> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return Object.freeze({
      extractedJsonText: "",
      parsedJson: null,
      parseErrors: Object.freeze([]),
      parseFailure: null,
    });
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace >= firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
  try {
    return Object.freeze({
      extractedJsonText: candidate,
      parsedJson: JSON.parse(candidate) as V3PromptJsonValue,
      parseErrors: Object.freeze([]),
      parseFailure: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const positionMatch = message.match(/position\s+(\d+)/i);
    const lineColumnMatch = message.match(/at line\s+(\d+)\s+column\s+(\d+)/i);
    const position = positionMatch && positionMatch[1] ? Number(positionMatch[1]) : null;
    const line = lineColumnMatch && lineColumnMatch[1] ? Number(lineColumnMatch[1]) : null;
    const column = lineColumnMatch && lineColumnMatch[2] ? Number(lineColumnMatch[2]) : null;
    const normalizedPosition = Number.isFinite(position ?? NaN) ? position : null;
    let parsedLine = line;
    let parsedColumn = column;
    if (normalizedPosition !== null && (parsedLine === null || parsedColumn === null)) {
      let currentLine = 1;
      let currentColumn = 1;
      for (let index = 0; index < Math.min(candidate.length, normalizedPosition); index++) {
        if (candidate[index] === "\n") {
          currentLine++;
          currentColumn = 1;
        } else {
          currentColumn++;
        }
      }
      parsedLine = currentLine;
      parsedColumn = currentColumn;
    }
    return Object.freeze({
      extractedJsonText: candidate,
      parsedJson: null,
      parseErrors: Object.freeze([
        `JSON.parse failed for provider response candidate: ${candidate.length > 0 ? candidate.slice(0, 200) : "[empty candidate]"}`,
        `Parse abort location: ${normalizedPosition !== null ? `position ${normalizedPosition}` : "unknown position"}${parsedLine !== null && parsedColumn !== null ? ` (line ${parsedLine}, column ${parsedColumn})` : ""}; ${message}`,
      ]),
      parseFailure: Object.freeze({
        message,
        position: normalizedPosition,
        line: parsedLine,
        column: parsedColumn,
      }),
    });
  }
}

function collectDiscardedFields(
  root: V3PromptJsonValue | null,
  payloadSource: "root" | "reasoning",
  payload: V3PromptJsonValue | null,
): readonly V3ProviderResponseDiscardedField[] {
  const discarded: V3ProviderResponseDiscardedField[] = [];

  if (isObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      const isReasoningWrapper = payloadSource === "reasoning";
      const allowedRootKey = isReasoningWrapper
        ? key === "reasoning" || key === "metadata"
        : EXPECTED_TOP_LEVEL_KEYS.includes(key as (typeof EXPECTED_TOP_LEVEL_KEYS)[number]);
      if (!allowedRootKey) {
        discarded.push(Object.freeze({ path: `root.${key}`, value: value as V3PromptJsonValue }));
      }
    }
  }

  if (payloadSource === "reasoning") {
    const reasoningPayload = isObject(payload) ? payload : {};
    for (const [key, value] of Object.entries(reasoningPayload)) {
      if (!EXPECTED_SECTION_KEYS.includes(key as (typeof EXPECTED_SECTION_KEYS)[number])) {
        discarded.push(Object.freeze({ path: `reasoning.${key}`, value: value as V3PromptJsonValue }));
      }
    }
  }

  const reasonedDecisionValue = isObject(payload)
    ? (payload.reasoned_decision ?? payload.reasonedDecision ?? payload.reasoned_decision_result ?? payload.reasonedDecisionResult)
    : null;
  if (isObject(reasonedDecisionValue)) {
    for (const [key, value] of Object.entries(reasonedDecisionValue)) {
      if (!EXPECTED_REASONED_DECISION_KEYS.includes(key as (typeof EXPECTED_REASONED_DECISION_KEYS)[number])) {
        discarded.push(Object.freeze({ path: `reasonedDecision.${key}`, value: value as V3PromptJsonValue }));
      }
    }
  }

  return Object.freeze(discarded);
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return Number(numeric.toFixed(6));
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
}

function normalizeArticleList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Number(item));
}

function normalizeArticleEvaluation(value: unknown): V3ReasonedDecisionArticleEvaluation {
  const input = isObject(value) ? value : {};
  return Object.freeze({
    articleId: Number.isFinite(Number(input.articleId ?? input.article_id)) ? Number(input.articleId ?? input.article_id) : 0,
    status: String(input.status ?? input.result ?? input.decision ?? "FAIL").toUpperCase() === "PASS" ? "PASS" : "FAIL",
    evidence: Object.freeze(normalizeList(input.evidence ?? input.supportingEvidence ?? input.supporting_evidence)),
    reason: String(input.reason ?? input.explanation ?? input.description ?? ""),
    confidence: clampConfidence(input.confidence),
  });
}

function normalizeNarrativeResult(value: unknown): LegalNarrativeResult {
  const input = isObject(value) ? value : {};
  return Object.freeze({
    speaker: (input.speaker ?? null) as LegalNarrativeResult["speaker"],
    listener: (input.listener ?? null) as LegalNarrativeResult["listener"],
    target: (input.target ?? null) as LegalNarrativeResult["target"],
    narrativeVoice: String(input.narrativeVoice ?? "unknown"),
    sceneType: String(input.sceneType ?? "unknown"),
    narrativeIntent: String(input.narrativeIntent ?? "unknown"),
    storyPosition: String(input.storyPosition ?? "unknown"),
    relationship: (input.relationship ?? null) as LegalNarrativeResult["relationship"],
    emotionalTone: String(input.emotionalTone ?? "unknown"),
    condemnation: Boolean(input.condemnation),
    approval: Boolean(input.approval),
    neutrality: Boolean(input.neutrality),
    historicalContext: Boolean(input.historicalContext),
    dream: Boolean(input.dream),
    flashback: Boolean(input.flashback),
    comedy: Boolean(input.comedy),
    satire: Boolean(input.satire),
    threat: Boolean(input.threat),
    instruction: Boolean(input.instruction),
    news: Boolean(input.news),
    documentary: Boolean(input.documentary),
    dialogue: Boolean(input.dialogue),
    narration: Boolean(input.narration),
    sceneDescription: Boolean(input.sceneDescription),
    confidence: clampConfidence(input.confidence),
    notes: normalizeList(input.notes),
  });
}

function normalizeEvidenceCandidate(value: unknown): LegalEvidenceCandidate {
  const input = isObject(value) ? value : {};
  return Object.freeze({
    text: String(input.text ?? ""),
    startOffset: Number.isFinite(Number(input.startOffset)) ? Number(input.startOffset) : 0,
    endOffset: Number.isFinite(Number(input.endOffset)) ? Number(input.endOffset) : 0,
    confidence: clampConfidence(input.confidence),
    source: (input.source === "chunk" ? "chunk" : String(input.source ?? "chunk")) as LegalEvidenceCandidate["source"],
    notes: normalizeList(input.notes),
  });
}

function normalizeEvidenceResult(value: unknown): LegalEvidenceResult {
  const input = isObject(value) ? value : {};
  const candidates = Array.isArray(input.candidates) ? input.candidates.map(normalizeEvidenceCandidate) : [];
  const primaryCandidateIndex = candidates.length > 0 && Number.isFinite(Number(input.primaryCandidateIndex))
    ? Math.min(Math.max(0, Number(input.primaryCandidateIndex)), candidates.length - 1)
    : null;

  return Object.freeze({
    candidates,
    primaryCandidateIndex,
    admissible: input.admissible === true,
    confidence: clampConfidence(input.confidence),
    notes: normalizeList(input.notes),
  });
}

function normalizeSemanticResult(value: unknown): LegalSemanticResult {
  const input = isObject(value) ? value : {};
  return Object.freeze({
    semanticMeaning: String(input.semanticMeaning ?? ""),
    narrativeIntent: String(input.narrativeIntent ?? ""),
    conversationRole: String(input.conversationRole ?? ""),
    sceneRole: String(input.sceneRole ?? ""),
    speaker: (input.speaker ?? null) as LegalSemanticResult["speaker"],
    listener: (input.listener ?? null) as LegalSemanticResult["listener"],
    target: (input.target ?? null) as LegalSemanticResult["target"],
    victim: (input.victim ?? null) as LegalSemanticResult["victim"],
    emotion: String(input.emotion ?? ""),
    riskContext: String(input.riskContext ?? ""),
    confidence: clampConfidence(input.confidence),
    notes: normalizeList(input.notes),
  });
}

function normalizeContextResult(value: unknown): LegalContextResult {
  const input = isObject(value) ? value : {};
  return Object.freeze({
    storyMemory: (input.storyMemory ?? null) as LegalContextResult["storyMemory"],
    sceneMemory: (input.sceneMemory ?? null) as LegalContextResult["sceneMemory"],
    localContext: String(input.localContext ?? ""),
    chunkContext: String(input.chunkContext ?? ""),
    neighboringSentences: Array.isArray(input.neighboringSentences) ? input.neighboringSentences.map((sentence) => String(sentence)) : [],
    narrativeContext: String(input.narrativeContext ?? ""),
    confidence: clampConfidence(input.confidence),
    notes: normalizeList(input.notes),
  });
}

function normalizeReasonedDecisionResult(value: unknown): V3ReasonedDecisionResult {
  const input = isObject(value) ? value : {};
  const rawArticleEvaluations = input.articleEvaluations ?? input.article_evaluations;
  const articleEvaluations = Object.freeze(
    Array.isArray(rawArticleEvaluations)
      ? rawArticleEvaluations.map(normalizeArticleEvaluation)
      : [],
  );
  return Object.freeze({
    reasoning: String(input.reasoning ?? input.why ?? ""),
    alternativeInterpretations: Object.freeze(normalizeList(input.alternativeInterpretations ?? input.alternative_interpretations)),
    confidence: clampConfidence(input.confidence),
    articleEvaluations,
    supportingEvidence: Object.freeze(normalizeList(input.supportingEvidence ?? input.supporting_evidence)),
    contradictingEvidence: Object.freeze(normalizeList(input.contradictingEvidence ?? input.contradicting_evidence)),
    applicableArticles: Object.freeze(normalizeArticleList(input.applicableArticles ?? input.applicable_articles)),
    rejectedArticles: Object.freeze(normalizeArticleList(input.rejectedArticles ?? input.rejected_articles)),
    riskAnalysis: String(input.riskAnalysis ?? input.risk_analysis ?? ""),
    narrativeAnalysis: String(input.narrativeAnalysis ?? input.narrative_analysis ?? ""),
    humanLikeExplanation: String(input.humanLikeExplanation ?? input.human_like_explanation ?? ""),
    recommendation: String(input.recommendation ?? input.recommendation_result ?? input.recommendationResult ?? ""),
  });
}

export function mapV3ProviderResponse(
  rawResponse: string,
  options?: Readonly<{
    onAudit?: (audit: V3ProviderResponseParseAudit) => void;
  }>,
): Readonly<{
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
  reasonedDecision: V3ReasonedDecisionResult;
}> {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: mapV3ProviderResponse", {
    rawResponseLength: rawResponse.length,
  });
  const extracted = extractJsonWithDiagnostics(rawResponse);
  const parsed = extracted.parsedJson;
  const parsedObject = isObject(parsed) ? parsed : null;
  const payloadSource = parsedObject && isObject(parsedObject.reasoning) ? "reasoning" as const : "root" as const;
  const payload = payloadSource === "reasoning"
    ? parsedObject?.reasoning ?? null
    : parsedObject;
  const source = isObject(payload) ? (payload as V3ReasoningResponsePayload) : {};
  const parserOutput = Object.freeze({
    narrative: normalizeNarrativeResult(source.narrative ?? source.narrative_result ?? source.narrativeResult),
    evidence: normalizeEvidenceResult(source.evidence ?? source.evidence_result ?? source.evidenceResult),
    semantic: normalizeSemanticResult(source.semantic ?? source.semantic_result ?? source.semanticResult),
    context: normalizeContextResult(source.context ?? source.context_result ?? source.contextResult),
    reasonedDecision: normalizeReasonedDecisionResult(
      source.reasoned_decision ??
      source.reasonedDecision ??
      source.reasoned_decision_result ??
      source.reasonedDecisionResult
    ),
  });
  const discardedFields = collectDiscardedFields(parsed, payloadSource, payload);
  const parseAudit: V3ProviderResponseParseAudit = Object.freeze({
    rawResponse,
    extractedJsonText: extracted.extractedJsonText,
    parseErrors: extracted.parseErrors,
    parseFailure: extracted.parseFailure,
    parserInput: Object.freeze({
      parsedJson: parsed,
      payloadSource,
      parseStrategy: payloadSource,
      fallbackParserUsed: false,
      fallbackParserName: null,
      topLevelKeys: Object.freeze(objectKeys(parsed)),
      payloadKeys: Object.freeze(objectKeys(payload)),
      expectedTopLevelKeys: EXPECTED_TOP_LEVEL_KEYS,
      expectedSectionKeys: EXPECTED_SECTION_KEYS,
      expectedReasonedDecisionKeys: EXPECTED_REASONED_DECISION_KEYS,
    }),
    discardedFields,
    parserOutput,
    finalReasonedDecision: parserOutput.reasonedDecision,
    parsedFindingCount: parserOutput.reasonedDecision.articleEvaluations.length,
    zeroFindingsReason:
      extracted.parseErrors.length > 0
        ? "JSON parsing failed; no provider decision could be recovered."
        : parserOutput.reasonedDecision.articleEvaluations.length === 0
          ? "No article evaluations were present in the parsed provider response."
          : parserOutput.reasonedDecision.articleEvaluations.every((evaluation) => evaluation.status !== "PASS")
            ? "No PASS article evaluations were parsed from the provider response."
            : null,
  });
  if (options?.onAudit) {
    options.onAudit(parseAudit);
  }
  if (parseAudit.parseErrors.length > 0 || parseAudit.discardedFields.length > 0 || parseAudit.zeroFindingsReason) {
    logger.warn("V3 provider response parse audit", parseAudit);
  } else {
    logger.info("V3 provider response parse audit", {
      rawResponseLength: rawResponse.length,
      payloadSource: parseAudit.parserInput.payloadSource,
      parseStrategy: parseAudit.parserInput.parseStrategy,
      fallbackParserUsed: parseAudit.parserInput.fallbackParserUsed,
      topLevelKeys: [...parseAudit.parserInput.topLevelKeys],
      payloadKeys: [...parseAudit.parserInput.payloadKeys],
      parsedFindingCount: parseAudit.parsedFindingCount,
      finalReasonedDecision: parseAudit.finalReasonedDecision,
    });
  }
  logger.info("V3 instrumentation EXIT: mapV3ProviderResponse", {
    rawResponseLength: rawResponse.length,
    durationMs: Date.now() - startedAt,
  });
  return parserOutput;
}
