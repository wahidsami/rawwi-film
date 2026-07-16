import type { LegalDecision } from "../legal/legalDecision.js";
import type { ArbitrationDecisionPackage, ArbitrationJudgeInput, ArbitrationKnowledgeBundle, ArbitrationRejectedReviewer } from "./arbitrationTypes.js";
import { calibrateConfidence } from "./confidenceCalibration.js";

type ArbitrationSemanticLayer = Readonly<{
  confidence: number;
  evidence_strength: number;
  literal_vs_implied_meaning: string;
  exception_signals: readonly string[];
  context_classification: string;
  narrative_intent: string;
}>;

type ArbitrationKnowledgeRetrieval = Readonly<{
  knowledge_confidence: number;
}>;

type ArbitrationDecisionMemoryRetrieval = Readonly<{
  memory_confidence: number;
}>;

type ArbitrationKnowledgeLayer = Readonly<{
  knowledge_retrieval?: ArbitrationKnowledgeRetrieval | null;
  decision_memory_retrieval?: ArbitrationDecisionMemoryRetrieval | null;
}>;

type ArbitrationPrecedentMatch = Readonly<{
  similarity: number;
}>;

type ArbitrationPrecedentLayer = Readonly<{
  top_matches?: readonly ArbitrationPrecedentMatch[] | null;
}>;

type ArbitrationReasoningPipeline = Readonly<{
  counterEvidence: readonly string[];
}>;

type ArbitrationSharedPackage = Readonly<{
  semantic: ArbitrationSemanticLayer;
  knowledge: ArbitrationKnowledgeLayer;
  precedents: ArbitrationPrecedentLayer;
  reasoning_pipeline: ArbitrationReasoningPipeline;
}>;

function sharedPackage(input: ArbitrationJudgeInput): ArbitrationSharedPackage {
  return input.debate.sharedPackage as unknown as ArbitrationSharedPackage;
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return Object.freeze(result.sort((left, right) => normalizeText(left).localeCompare(normalizeText(right))));
}

function confidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return confidence(values.reduce((sum, value) => sum + confidence(value), 0) / values.length);
}

function numericArrayAverage(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return confidence(values.reduce((sum, value) => sum + confidence(value), 0) / values.length);
}

function knowledgeCount(bundle: ArbitrationKnowledgeBundle): number {
  return (
    bundle.lessons.length +
    bundle.blueprints.length +
    bundle.patterns.length +
    bundle.precedents.length +
    bundle.cases.length +
    bundle.relationships.length
  );
}

function majorityStatus(opinions: ArbitrationJudgeInput["debate"]["opinions"], fallback: LegalDecision["status"]): LegalDecision["status"] {
  const counts = new Map<LegalDecision["status"], number>();
  for (const opinion of opinions) {
    counts.set(opinion.status, (counts.get(opinion.status) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? fallback;
}

function opinionSortKey(
  opinion: ArbitrationJudgeInput["debate"]["opinions"][number],
  majority: LegalDecision["status"],
): readonly [number, number, number, number, number, number, string] {
  return [
    opinion.status === majority ? 1 : 0,
    opinion.applicable ? 1 : 0,
    opinion.status === "accept" ? 1 : opinion.status === "needs_review" ? 0 : -1,
    Math.round(confidence(opinion.confidence) * 1000),
    opinion.supportingEvidence.length,
    knowledgeCount(buildKnowledgeBundle(opinion)),
    opinion.reviewerId,
  ];
}

function pickWinningOpinion(input: ArbitrationJudgeInput): readonly [number, ArbitrationJudgeInput["debate"]["opinions"][number]] {
  const fallbackStatus = input.debate.primaryDecision.status;
  const majority = majorityStatus(input.debate.opinions, fallbackStatus);
  return [...input.debate.opinions.entries()]
    .sort((left, right) => {
      const leftKey = opinionSortKey(left[1], majority);
      const rightKey = opinionSortKey(right[1], majority);
      if (leftKey[0] !== rightKey[0]) return rightKey[0] - leftKey[0];
      if (leftKey[1] !== rightKey[1]) return rightKey[1] - leftKey[1];
      if (leftKey[2] !== rightKey[2]) return rightKey[2] - leftKey[2];
      if (leftKey[3] !== rightKey[3]) return rightKey[3] - leftKey[3];
      if (leftKey[4] !== rightKey[4]) return rightKey[4] - leftKey[4];
      if (leftKey[5] !== rightKey[5]) return rightKey[5] - leftKey[5];
      return leftKey[6].localeCompare(rightKey[6]);
    })[0] ?? [0, input.debate.opinions[0]!];
}

function buildKnowledgeBundle(opinion: ArbitrationJudgeInput["debate"]["opinions"][number]): ArbitrationKnowledgeBundle {
  return Object.freeze({
    lessons: [...opinion.supportingKnowledge.lessons],
    blueprints: [...opinion.supportingKnowledge.blueprints],
    patterns: [...opinion.supportingKnowledge.patterns],
    precedents: [...opinion.supportingKnowledge.precedents],
    cases: [...opinion.supportingKnowledge.cases],
    relationships: [...opinion.supportingKnowledge.relationships],
  });
}

function extractKnowledgeConfidence(input: ArbitrationJudgeInput): number {
  const knowledgeRetrieval = sharedPackage(input).knowledge.knowledge_retrieval;
  const decisionMemoryRetrieval = sharedPackage(input).knowledge.decision_memory_retrieval;
  return numericArrayAverage([
    typeof knowledgeRetrieval?.knowledge_confidence === "number" ? knowledgeRetrieval.knowledge_confidence : 0,
    typeof decisionMemoryRetrieval?.memory_confidence === "number" ? decisionMemoryRetrieval.memory_confidence : 0,
  ]);
}

function extractPrecedentAgreement(input: ArbitrationJudgeInput): number {
  const precedents = sharedPackage(input).precedents.top_matches ?? [];
  if (precedents.length === 0) return 0;
  return numericArrayAverage(precedents.map((precedent) => Number(precedent.similarity ?? 0)));
}

function extractCounterEvidence(input: ArbitrationJudgeInput): number {
  const assistantCounterEvidence = input.debate.gptAssistant?.contradictingEvidence.length ?? 0;
  const reasoningCounterEvidence = sharedPackage(input).reasoning_pipeline.counterEvidence.length ?? 0;
  const totalEvidence = (input.debate.gptAssistant?.supportingEvidence.length ?? 0) + assistantCounterEvidence + reasoningCounterEvidence;
  if (totalEvidence <= 0) return 0;
  return confidence((assistantCounterEvidence + reasoningCounterEvidence) / totalEvidence);
}

function extractNarrativeAmbiguity(input: ArbitrationJudgeInput): number {
  const semantic = sharedPackage(input).semantic;
  const ambiguitySignals = [
    semantic.literal_vs_implied_meaning !== "literal" ? 0.35 : 0,
    semantic.exception_signals.length > 0 ? 0.2 : 0,
    semantic.context_classification === "unknown" ? 0.1 : 0,
    semantic.narrative_intent === "unknown" ? 0.1 : 0,
  ];
  return confidence(Math.min(1, ambiguitySignals.reduce((sum, value) => sum + value, 0)));
}

export function buildArbitrationDecisionPackage(input: ArbitrationJudgeInput): ArbitrationDecisionPackage {
  const [winningOpinionIndex, winningOpinion] = pickWinningOpinion(input);
  const packageView = sharedPackage(input);
  const rejectedReviewers = input.debate.opinions
    .filter((opinion) => opinion.reviewerId !== winningOpinion.reviewerId)
    .map<ArbitrationRejectedReviewer>((opinion) => Object.freeze({
      reviewerId: opinion.reviewerId,
      reviewerName: opinion.reviewerName,
      reason: opinion.reasoning,
      status: opinion.status,
      confidence: confidence(opinion.confidence),
    }));
  const winningKnowledge = buildKnowledgeBundle(winningOpinion);
  const confidenceCalibration = calibrateConfidence({
    baseConfidence: winningOpinion.confidence,
    semanticConfidence: packageView.semantic.confidence,
    knowledgeConfidence: extractKnowledgeConfidence(input),
    precedentAgreement: extractPrecedentAgreement(input),
    reviewerAgreement: input.debate.metrics.agreement,
    evidenceQuality: numericArrayAverage([
      packageView.semantic.evidence_strength,
      input.debate.gptAssistant?.confidence ?? packageView.semantic.evidence_strength,
    ]),
    counterEvidence: extractCounterEvidence(input),
    narrativeAmbiguity: extractNarrativeAmbiguity(input),
    consensusScore: input.debate.consensusScore,
    disagreementScore: input.debate.metrics.disagreement,
  });
  const confidenceAdjustment = confidenceCalibration.adjustment;
  const finalConfidence = confidenceCalibration.confidence;
  const needsHumanReview =
    input.debate.consensusScore < 0.65 ||
    input.debate.metrics.disagreement > 0.35 ||
    finalConfidence < 0.65 ||
    winningOpinion.needsHumanReview;

  const winningReviewer = Object.freeze({
    reviewerId: winningOpinion.reviewerId,
    reviewerName: winningOpinion.reviewerName,
    status: winningOpinion.status,
    confidence: finalConfidence,
  });

  const winningEvidence = Object.freeze([...uniqueStrings(winningOpinion.supportingEvidence)]);
  const winningLessons = Object.freeze([...winningKnowledge.lessons]);
  const winningBlueprints = Object.freeze([...winningKnowledge.blueprints]);
  const winningPatterns = Object.freeze([...winningKnowledge.patterns]);
  const winningPrecedents = Object.freeze([...winningKnowledge.precedents]);
  const winningCases = Object.freeze([...winningKnowledge.cases]);
  const winningRelationships = Object.freeze([...winningKnowledge.relationships]);
  const winningArticle = winningOpinion.status === "accept"
    ? (winningOpinion.suggestedArticles[0] ?? input.debate.primaryDecision.articleIds[0] ?? null)
    : null;
  const finalArticle = winningArticle;
  const rejectedReasons = Object.freeze(rejectedReviewers.map((reviewer) => reviewer.reason));
  const escalationRecommendation = needsHumanReview
    ? "Escalate to human reviewer because reviewer disagreement or confidence warrants review."
    : "No escalation required; arbitration consensus is stable.";

  return Object.freeze({
    debate: input.debate,
    winningReviewer,
    winningOpinion: Object.freeze({
      ...winningOpinion,
      supportingKnowledge: Object.freeze({
        lessons: [...winningOpinion.supportingKnowledge.lessons],
        blueprints: [...winningOpinion.supportingKnowledge.blueprints],
        patterns: [...winningOpinion.supportingKnowledge.patterns],
        relationships: [...winningOpinion.supportingKnowledge.relationships],
        cases: [...winningOpinion.supportingKnowledge.cases],
        precedents: [...winningOpinion.supportingKnowledge.precedents],
      }),
      supportingEvidence: [...winningOpinion.supportingEvidence],
      suggestedArticles: [...winningOpinion.suggestedArticles],
      rejectedArticles: [...winningOpinion.rejectedArticles],
    }),
    winningOpinionIndex,
    winningReason: winningOpinion.reasoning,
    winningEvidence,
    winningKnowledge,
    winningLessons,
    winningBlueprints,
    winningPatterns,
    winningPrecedents,
    winningCases,
    winningRelationships,
    winningArticle,
    finalArticle,
    rejectedReviewers: Object.freeze([...rejectedReviewers]),
    rejectedReasons,
    confidence: finalConfidence,
    confidenceAdjustment,
    confidenceCalibration,
    consensusScore: input.debate.consensusScore,
    agreementMatrix: input.debate.agreementMatrix,
    disagreementMatrix: input.debate.disagreementMatrix,
    confidenceDistribution: input.debate.confidenceDistribution,
    metrics: input.debate.metrics,
    conflicts: Object.freeze([...input.debate.conflictingArticles]),
    needsHumanReview,
    escalationRecommendation,
    decisionExplanation: [
      `Winning reviewer: ${winningOpinion.reviewerName}`,
      `Winning status: ${winningOpinion.status}`,
      `Winning article: ${winningArticle ?? "none"}`,
      `Consensus score: ${input.debate.consensusScore.toFixed(6)}`,
      `Confidence adjustment: ${confidenceAdjustment.toFixed(6)}`,
      `Final confidence: ${finalConfidence.toFixed(6)}`,
      `Escalation: ${needsHumanReview ? "required" : "not required"}`,
    ].join(" | "),
    decisionDurationMs: 0,
    finalDecisionStatus: winningOpinion.status,
  });
}
