import type { LegalContextResult, LegalEvidenceCandidate, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";
import type { V3PromptJsonObject, V3PromptJsonValue } from "../builder/builderTypes.js";
import type { V3ReasonedDecisionResult, V3ReasoningResponsePayload } from "./providerTypes.js";

function isObject(value: unknown): value is V3PromptJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace >= firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
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
  return Object.freeze({
    reasoning: String(input.reasoning ?? input.why ?? ""),
    alternativeInterpretations: Object.freeze(normalizeList(input.alternativeInterpretations ?? input.alternative_interpretations)),
    confidence: clampConfidence(input.confidence),
    supportingEvidence: Object.freeze(normalizeList(input.supportingEvidence ?? input.supporting_evidence)),
    contradictingEvidence: Object.freeze(normalizeList(input.contradictingEvidence ?? input.contradicting_evidence)),
    applicableArticles: Object.freeze(normalizeArticleList(input.applicableArticles ?? input.applicable_articles)),
    rejectedArticles: Object.freeze(normalizeArticleList(input.rejectedArticles ?? input.rejected_articles)),
    riskAnalysis: String(input.riskAnalysis ?? input.risk_analysis ?? ""),
    narrativeAnalysis: String(input.narrativeAnalysis ?? input.narrative_analysis ?? ""),
    humanLikeExplanation: String(input.humanLikeExplanation ?? input.human_like_explanation ?? ""),
  });
}

export function mapV3ProviderResponse(rawResponse: string): Readonly<{
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
  reasonedDecision: V3ReasonedDecisionResult;
}> {
  const parsed = extractJson(rawResponse);
  const payload = isObject(parsed) ? (parsed.reasoning && isObject(parsed.reasoning) ? parsed.reasoning : parsed) : {};
  const source = payload as V3ReasoningResponsePayload;

  return Object.freeze({
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
}
