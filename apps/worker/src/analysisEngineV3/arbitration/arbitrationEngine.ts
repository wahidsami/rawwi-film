import type { LegalDecision } from "../legal/legalDecision.js";
import type { ArbitrationDecisionPackage, ArbitrationJudgeInput, ArbitrationKnowledgeBundle, ArbitrationRejectedReviewer } from "./arbitrationTypes.js";

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

export function buildArbitrationDecisionPackage(input: ArbitrationJudgeInput): ArbitrationDecisionPackage {
  const [winningOpinionIndex, winningOpinion] = pickWinningOpinion(input);
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
  const confidenceAdjustment = confidence(0.6 + 0.4 * average([input.debate.consensusScore, input.debate.metrics.agreement]));
  const finalConfidence = confidence(winningOpinion.confidence * confidenceAdjustment);
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
  const winningArticle = winningOpinion.suggestedArticles[0] ?? input.debate.primaryDecision.articleIds[0] ?? null;
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
