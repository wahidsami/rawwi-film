import type { QualityJudgeReport, QualityJudgeRuleEvaluation, VerifiedFinding } from "./qualityJudgeTypes.js";

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))].sort());
}

export function buildQualityJudgeReport(input: Readonly<{
  sceneId: string;
  verifiedFindings: readonly VerifiedFinding[];
  ruleEvaluations: readonly QualityJudgeRuleEvaluation[];
  duplicateMergedCount: number;
}>): QualityJudgeReport {
  const passCount = input.verifiedFindings.filter((finding) => finding.verificationResult === "pass").length;
  const rejectCount = input.verifiedFindings.filter((finding) => finding.verificationResult === "reject").length;
  const needsReviewCount = input.verifiedFindings.filter((finding) => finding.verificationResult === "needs_review").length;
  const overallStatus = rejectCount > 0
    ? "reject"
    : needsReviewCount > 0
      ? "needs_review"
      : "pass";
  const overallConfidence = input.verifiedFindings.length === 0
    ? 0
    : Number((input.verifiedFindings.reduce((sum, finding) => sum + finding.overallConfidence, 0) / input.verifiedFindings.length).toFixed(6));
  const rejectionReasons = uniqueStrings([
    ...input.verifiedFindings.flatMap((finding) => finding.verificationResult === "pass" ? [] : finding.verificationReasons),
    ...input.ruleEvaluations.filter((evaluation) => !evaluation.passed).map((evaluation) => `${evaluation.ruleId}:${evaluation.reason}`),
  ]);

  return Object.freeze({
    sceneId: input.sceneId,
    totalFindings: input.verifiedFindings.length,
    passCount,
    rejectCount,
    needsReviewCount,
    duplicateMergedCount: input.duplicateMergedCount,
    overallStatus,
    overallConfidence,
    ruleEvaluations: Object.freeze([...input.ruleEvaluations]),
    rejectionReasons,
  });
}
