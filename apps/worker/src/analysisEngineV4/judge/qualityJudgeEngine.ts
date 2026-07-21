import type { ExplanationRecord, ExplanationCollection } from "../explanations/explanationTypes.js";
import type { SceneAnalysisConcept, SceneAnalysisConceptCollection, SceneAnalysisEvidenceCollection, SceneAnalysisLegalDecisionCollection, SceneAnalysisQualityJudgment, SceneAnalysisState } from "../sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import { buildQualityJudgeReport } from "./qualityJudgeReport.js";
import type { QualityJudgeEngineInput, VerifiedFinding, VerifiedFindingCollection } from "./qualityJudgeTypes.js";
import { mergeQualityJudgeCandidates, validateQualityJudgeCandidates } from "./qualityJudgeValidator.js";
import { createEvidenceCollectionFromVerifiedEvidence } from "../evidence/evidenceTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))].sort());
}

function synthesizeEvidenceCollection(state: SceneAnalysisState): SceneAnalysisEvidenceCollection | null {
  if (state.verifiedEvidence) {
    return createEvidenceCollectionFromVerifiedEvidence(state.sceneId, state.verifiedEvidence);
  }

  if (state.evidenceCollection && state.evidenceCollection.evidence.length > 0) {
    return state.evidenceCollection;
  }

  return null;
}

function synthesizeConceptCollection(state: SceneAnalysisState): SceneAnalysisConceptCollection | null {
  if (state.conceptCollection && state.conceptCollection.concepts.length > 0) {
    return state.conceptCollection;
  }

  if (state.detectedConcepts.length === 0) {
    return null;
  }

  const evidenceId = state.verifiedEvidence?.evidenceId ?? state.primaryEvidenceSpanId ?? "legacy-evidence";
  const concepts = state.detectedConcepts.map((concept, index) => Object.freeze({
    id: `legacy-concept-${index + 1}`,
    evidenceId,
    evidenceSpanId: concept.evidenceSpanIds[0] ?? evidenceId,
    conceptId: concept.conceptId,
    conceptName: concept.label,
    conceptCategory: concept.knowledgeDomains[0] ?? concept.label.toLowerCase(),
    confidence: concept.confidence,
    severity: "high" as const,
    targets: Object.freeze([]),
    participants: Object.freeze([]),
    reason: concept.rationale[0] ?? `Legacy concept ${concept.label}.`,
    supportingEvidenceIds: Object.freeze([...concept.evidenceSpanIds]),
    evidenceSpanIds: Object.freeze([...concept.evidenceSpanIds]),
    knowledgeDomains: Object.freeze([...concept.knowledgeDomains]),
    label: concept.label,
    rationale: Object.freeze([...concept.rationale]),
  }));

  const confidence = concepts.length === 0 ? 0 : Number((concepts.reduce((sum, concept) => sum + concept.confidence, 0) / concepts.length).toFixed(6));

  return Object.freeze({
    sceneId: state.sceneId,
    evidenceCollectionId: state.evidenceCollection?.sceneId ?? null,
    concepts: Object.freeze(concepts),
    dedupDecisions: Object.freeze([]),
    normalization: Object.freeze([]),
    classificationOutput: Object.freeze([]),
    confidence,
    executionTimeMs: 0,
  });
}

function synthesizeLegalDecisionCollection(
  state: SceneAnalysisState,
  conceptCollection: SceneAnalysisConceptCollection | null,
): SceneAnalysisLegalDecisionCollection | null {
  if (state.legalDecisionCollection && state.legalDecisionCollection.decisions.length > 0) {
    return state.legalDecisionCollection;
  }

  const concept = conceptCollection?.concepts[0] ?? null;
  const article = state.legalPrimaryArticle ?? state.primaryArticle ?? state.legalCandidateArticles[0] ?? state.candidateArticles[0] ?? null;
  if (!concept || !article) {
    return null;
  }

  const candidateArticle = Object.freeze({
    ...article,
  });

  const decision = Object.freeze({
    id: `legacy-legal-${concept.conceptId}`,
    conceptId: concept.conceptId,
    candidateArticles: Object.freeze([candidateArticle]),
    primaryArticle: candidateArticle,
    secondaryArticles: Object.freeze(state.legalSecondaryArticles.slice(0, 2)),
    mappingReason: `Legacy article selection preserved for ${concept.label}.`,
    mappingConfidence: concept.confidence,
    knowledgeSource: "legacy",
  });

  return Object.freeze({
    sceneId: state.sceneId,
    conceptIds: Object.freeze([concept.conceptId]),
    decisions: Object.freeze([decision]),
    candidateArticles: Object.freeze([candidateArticle]),
    rankedCandidateArticles: Object.freeze([candidateArticle]),
    primaryArticle: candidateArticle,
    secondaryArticles: Object.freeze(state.legalSecondaryArticles.slice(0, 2)),
    supportingArticles: Object.freeze([]),
    knowledgeSource: "legacy",
    confidence: concept.confidence,
    executionTimeMs: 0,
  });
}

function synthesizeExplanationCollection(state: SceneAnalysisState): ExplanationCollection | null {
  if (state.explanationCollection && state.explanationCollection.explanations.length > 0) {
    return state.explanationCollection;
  }

  if (!state.explanation) {
    return null;
  }

  const decision = state.legalDecisionCollection?.decisions[0] ?? null;
  const explanationRecord = Object.freeze({
    id: "legacy-explanation-1",
    legalDecisionId: decision?.id ?? "legacy-legal",
    conceptId: state.detectedConcepts[0]?.conceptId ?? "legacy-concept",
    evidenceId: state.verifiedEvidence?.evidenceId ?? "legacy-evidence",
    title: state.explanation.primaryArticleTitleAr ?? "Legacy explanation",
    summary: state.explanation.summary,
    reasoning: Object.freeze([...state.explanation.rationale]),
    recommendedAction: "Requires Verification" as const,
    confidence: 0.9,
  });

  return Object.freeze({
    sceneId: state.sceneId,
    explanations: Object.freeze([explanationRecord]),
    primaryExplanationId: explanationRecord.id,
    primaryExplanation: explanationRecord,
    prompt: "",
    response: JSON.stringify({ explanations: [explanationRecord] }, null, 2),
    validationResult: Object.freeze({ status: "pass" as const, rejectedReasons: Object.freeze([]) }),
    confidence: explanationRecord.confidence,
    executionTimeMs: 0,
  });
}

function buildLegacyQualityJudgment(verifiedFinding: VerifiedFinding | null, reportStatus: VerifiedFindingCollection["report"]["overallStatus"]): SceneAnalysisQualityJudgment {
  const status = reportStatus === "pass" ? "pass" : "reject";
  const reasons = verifiedFinding?.verificationReasons ?? [];
  const hasQuote = reasons.some((reason) => reason.includes("evidence"));
  const hasArticle = reasons.some((reason) => reason.includes("article"));
  const hallucination = reasons.some((reason) => reason.includes("hallucination"));

  return Object.freeze({
    status,
    quoteExists: hasQuote,
    explanationReferencesQuote: hasQuote,
    articleMatchesConcept: hasArticle,
    sceneSummarySupportsExplanation: status === "pass",
    explanationMentionsAnotherFinding: reasons.some((reason) => reason.includes("duplicate")),
    explanationInventsFacts: hallucination,
    rejectionReasons: Object.freeze(reasons),
  });
}

export function createVerifiedFindingCollectionFromState(state: SceneAnalysisState): VerifiedFindingCollection {
  const startedAt = Date.now();
  const evidenceCollection = synthesizeEvidenceCollection(state);
  const conceptCollection = synthesizeConceptCollection(state);
  const legalDecisionCollection = synthesizeLegalDecisionCollection(state, conceptCollection);
  const explanationCollection = synthesizeExplanationCollection(state);
  const input: QualityJudgeEngineInput = {
    sceneId: state.sceneId,
    evidenceCollection,
    conceptCollection,
    legalDecisionCollection,
    explanationCollection,
  };
  const candidates = validateQualityJudgeCandidates(input);
  const merged = mergeQualityJudgeCandidates(candidates);
  const report = buildQualityJudgeReport({
    sceneId: state.sceneId,
    verifiedFindings: merged.verifiedFindings,
    ruleEvaluations: candidates.flatMap((candidate) => candidate.ruleEvaluations),
    duplicateMergedCount: merged.duplicateMergedCount,
  });
  const primaryVerifiedFinding = merged.verifiedFindings[0] ?? null;

  return Object.freeze({
    sceneId: state.sceneId,
    verifiedFindings: merged.verifiedFindings,
    primaryVerifiedFindingId: primaryVerifiedFinding?.findingId ?? null,
    primaryVerifiedFinding,
    ruleEvaluations: candidates.flatMap((candidate) => candidate.ruleEvaluations),
    report,
    confidence: report.overallConfidence,
    executionTimeMs: Math.max(0, Date.now() - startedAt),
  });
}

export function createLegacyQualityJudgmentFromCollection(collection: VerifiedFindingCollection): SceneAnalysisQualityJudgment {
  return buildLegacyQualityJudgment(collection.primaryVerifiedFinding, collection.report.overallStatus);
}

export function buildJudgeStateUpdates(state: SceneAnalysisState): Readonly<{
  verifiedFindingCollection: VerifiedFindingCollection;
  qualityJudgment: SceneAnalysisQualityJudgment;
  status: SceneAnalysisState["status"];
}> {
  const verifiedFindingCollection = createVerifiedFindingCollectionFromState(state);
  const qualityJudgment = createLegacyQualityJudgmentFromCollection(verifiedFindingCollection);
  return Object.freeze({
    verifiedFindingCollection,
    qualityJudgment,
    status: qualityJudgment.status === "reject" ? "failed" : state.status,
  });
}
