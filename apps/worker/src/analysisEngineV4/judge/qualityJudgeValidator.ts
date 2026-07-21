import type { ExplanationRecord } from "../explanations/explanationTypes.js";
import type { QualityJudgeEngineInput, QualityJudgeRuleEvaluation, QualityJudgeStatus, VerifiedFinding } from "./qualityJudgeTypes.js";
import { evaluateRuleSet, findConcept, findDecision, findEvidence, findExplanation } from "./qualityJudgeRules.js";

export type ValidatedQualityFindingCandidate = Readonly<{
  findingId: string;
  evidenceId: string;
  conceptId: string;
  legalDecisionId: string;
  explanationId: string;
  verificationResult: QualityJudgeStatus;
  verificationReasons: readonly string[];
  overallConfidence: number;
  ruleEvaluations: readonly QualityJudgeRuleEvaluation[];
}>;

function createCandidate(input: QualityJudgeEngineInput, explanation: ExplanationRecord): ValidatedQualityFindingCandidate {
  const ruleResult = evaluateRuleSet(input, explanation);
  const evidence = findEvidence(input.evidenceCollection, explanation.evidenceId);
  const concept = findConcept(input.conceptCollection, explanation.conceptId);
  const decision = findDecision(input.legalDecisionCollection, explanation.legalDecisionId);
  const explanationRecord = findExplanation(input.explanationCollection, explanation.id) ?? explanation;
  const hardReject = ruleResult.baseStatus === "reject";

  return Object.freeze({
    findingId: explanation.id,
    evidenceId: evidence?.id ?? explanation.evidenceId,
    conceptId: concept?.conceptId ?? explanation.conceptId,
    legalDecisionId: decision?.id ?? explanation.legalDecisionId,
    explanationId: explanationRecord.id,
    verificationResult: hardReject ? "reject" : "pass",
    verificationReasons: Object.freeze([...ruleResult.verificationReasons]),
    overallConfidence: ruleResult.overallConfidence,
    ruleEvaluations: ruleResult.ruleEvaluations,
  });
}

export function validateQualityJudgeCandidates(input: QualityJudgeEngineInput): readonly ValidatedQualityFindingCandidate[] {
  const explanations = input.explanationCollection?.explanations ?? [];
  return Object.freeze(explanations.map((explanation) => createCandidate(input, explanation)));
}

export function mergeQualityJudgeCandidates(candidates: readonly ValidatedQualityFindingCandidate[]): Readonly<{
  verifiedFindings: readonly VerifiedFinding[];
  duplicateMergedCount: number;
}> {
  const grouped = new Map<string, ValidatedQualityFindingCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.evidenceId}|${candidate.conceptId}|${candidate.legalDecisionId}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(candidate);
    grouped.set(key, bucket);
  }

  const verifiedFindings: VerifiedFinding[] = [];
  let duplicateMergedCount = 0;

  for (const [key, group] of [...grouped.entries()].sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))) {
    const sortedGroup = [...group].sort((left, right) => right.overallConfidence - left.overallConfidence || left.findingId.localeCompare(right.findingId));
    const primary = sortedGroup[0]!;
    duplicateMergedCount += Math.max(0, sortedGroup.length - 1);

    const hasReject = sortedGroup.some((candidate) => candidate.verificationResult === "reject");
    const mergedReasons = new Set<string>(sortedGroup.flatMap((candidate) => candidate.verificationReasons));
    if (sortedGroup.length > 1) {
      mergedReasons.add("duplicate_finding_merged");
    }

    const verificationResult: QualityJudgeStatus = hasReject
      ? "reject"
      : sortedGroup.length > 1
        ? "needs_review"
        : "pass";

    verifiedFindings.push(Object.freeze({
      findingId: primary.findingId || key,
      evidenceId: primary.evidenceId,
      conceptId: primary.conceptId,
      legalDecisionId: primary.legalDecisionId,
      explanationId: primary.explanationId,
      verificationResult,
      verificationReasons: Object.freeze([...mergedReasons].sort()),
      overallConfidence: Number(sortedGroup.reduce((sum, candidate) => sum + candidate.overallConfidence, 0) / sortedGroup.length || 0),
    }));
  }

  return Object.freeze({
    verifiedFindings: Object.freeze(verifiedFindings.sort((left, right) => right.overallConfidence - left.overallConfidence || left.findingId.localeCompare(right.findingId))),
    duplicateMergedCount,
  });
}
