import type { BenchmarkActualFinding, BenchmarkGroundTruthFinding } from "../benchmark/benchmarkTypes.js";
import { compareFindingSets, type EvaluationSetAgreement } from "./agreementMetrics.js";

export type ReviewScore = Readonly<EvaluationSetAgreement & {
  falsePositiveRate: number;
  falseNegativeRate: number;
}>;

function ratio(passed: number, total: number): number {
  if (total <= 0) return 1;
  return Number((passed / total).toFixed(6));
}

export function scoreReview(
  reference: readonly BenchmarkGroundTruthFinding[],
  actual: readonly BenchmarkActualFinding[],
): ReviewScore {
  const agreement = compareFindingSets(reference, actual);
  const falsePositiveRate = ratio(agreement.falsePositiveCount, Math.max(1, actual.length));
  const falseNegativeRate = ratio(agreement.falseNegativeCount, Math.max(1, reference.length));

  return Object.freeze({
    ...agreement,
    falsePositiveRate,
    falseNegativeRate,
  });
}

export function averageReviewScore(scores: readonly ReviewScore[]): ReviewScore {
  if (scores.length === 0) {
    return Object.freeze({
      truePositiveCount: 0,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      precision: 1,
      recall: 1,
      f1: 1,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
    });
  }

  const total = scores.length;
  const sum = scores.reduce((accumulator, score) => ({
    truePositiveCount: accumulator.truePositiveCount + score.truePositiveCount,
    falsePositiveCount: accumulator.falsePositiveCount + score.falsePositiveCount,
    falseNegativeCount: accumulator.falseNegativeCount + score.falseNegativeCount,
    precision: accumulator.precision + score.precision,
    recall: accumulator.recall + score.recall,
    f1: accumulator.f1 + score.f1,
    falsePositiveRate: accumulator.falsePositiveRate + score.falsePositiveRate,
    falseNegativeRate: accumulator.falseNegativeRate + score.falseNegativeRate,
  }), {
    truePositiveCount: 0,
    falsePositiveCount: 0,
    falseNegativeCount: 0,
    precision: 0,
    recall: 0,
    f1: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
  });

  return Object.freeze({
    truePositiveCount: Math.round(sum.truePositiveCount / total),
    falsePositiveCount: Math.round(sum.falsePositiveCount / total),
    falseNegativeCount: Math.round(sum.falseNegativeCount / total),
    precision: Number((sum.precision / total).toFixed(6)),
    recall: Number((sum.recall / total).toFixed(6)),
    f1: Number((sum.f1 / total).toFixed(6)),
    falsePositiveRate: Number((sum.falsePositiveRate / total).toFixed(6)),
    falseNegativeRate: Number((sum.falseNegativeRate / total).toFixed(6)),
  });
}

