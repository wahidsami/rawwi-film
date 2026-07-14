import type { ValidationCaseResult, ValidationMetrics } from "../types/validationTypes.js";

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 100;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

export function buildValidationMetrics(results: readonly ValidationCaseResult[]): ValidationMetrics {
  const totalCases = results.length;
  const passedCases = results.filter((result) => result.passed).length;
  const positiveExpected = results.filter((result) => result.case.expectedFinding.disposition === "match").length;
  const positiveActual = results.filter((result) => result.actualFinding.disposition === "match").length;
  const truePositives = results.filter((result) => result.case.expectedFinding.disposition === "match" && result.actualFinding.disposition === "match").length;
  const falsePositives = results.filter((result) => result.case.expectedFinding.disposition !== "match" && result.actualFinding.disposition === "match").length;
  const falseNegatives = results.filter((result) => result.case.expectedFinding.disposition === "match" && result.actualFinding.disposition !== "match").length;

  const conceptAccuracy = percentage(results.filter((result) => !result.mismatches.concepts).length, totalCases);
  const intentAccuracy = percentage(results.filter((result) => !result.mismatches.intent).length, totalCases);
  const contextAccuracy = percentage(results.filter((result) => !result.mismatches.context).length, totalCases);
  const evidenceAccuracy = percentage(results.filter((result) => !result.mismatches.evidence).length, totalCases);
  const judgmentAccuracy = percentage(results.filter((result) => !result.mismatches.judgment).length, totalCases);
  const articleAccuracy = percentage(results.filter((result) => !result.mismatches.article).length, totalCases);
  const atomAccuracy = percentage(results.filter((result) => !result.mismatches.atom).length, totalCases);
  const findingAccuracy = percentage(results.filter((result) => !result.mismatches.finding).length, totalCases);
  const explanationAccuracy = percentage(results.filter((result) => !result.mismatches.explanation).length, totalCases);
  const confidenceAccuracy = percentage(results.filter((result) => !result.mismatches.confidence).length, totalCases);
  const passRate = percentage(passedCases, totalCases);
  const precision = percentage(truePositives, positiveActual);
  const recall = percentage(truePositives, positiveExpected);
  const readinessScore = Number((
    (conceptAccuracy +
      intentAccuracy +
      contextAccuracy +
      evidenceAccuracy +
      judgmentAccuracy +
      articleAccuracy +
      atomAccuracy +
      findingAccuracy +
      explanationAccuracy +
      confidenceAccuracy) / 10
  ).toFixed(6));

  return Object.freeze({
    totalCases,
    passedCases,
    passRate,
    precision,
    recall,
    falsePositives,
    falseNegatives,
    conceptAccuracy,
    intentAccuracy,
    contextAccuracy,
    evidenceAccuracy,
    judgmentAccuracy,
    articleAccuracy,
    atomAccuracy,
    findingAccuracy,
    explanationAccuracy,
    confidenceAccuracy,
    readinessScore,
  });
}

