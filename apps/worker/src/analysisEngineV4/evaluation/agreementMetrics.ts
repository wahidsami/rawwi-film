import type { BenchmarkActualFinding, BenchmarkFindingAction, BenchmarkGroundTruthFinding } from "../benchmark/benchmarkTypes.js";

export type EvaluationSetAgreement = Readonly<{
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  precision: number;
  recall: number;
  f1: number;
}>;

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function groundTruthFindingKey(finding: BenchmarkGroundTruthFinding): string {
  return [
    normalizeText(finding.expectedEvidence.text),
    finding.expectedEvidence.startOffset ?? -1,
    finding.expectedEvidence.endOffset ?? -1,
    finding.expectedEvidence.lineId ?? "n/a",
    finding.expectedConceptId,
    finding.expectedGcamArticleId,
    normalizeText(finding.expectedExplanation),
    finding.expectedAction,
  ].join("|");
}

function actualFindingKey(finding: BenchmarkActualFinding): string {
  return [
    normalizeText(finding.evidence.text),
    finding.evidence.startOffset ?? -1,
    finding.evidence.endOffset ?? -1,
    finding.evidence.lineId ?? "n/a",
    finding.conceptId ?? "n/a",
    finding.gcamArticleId ?? -1,
    normalizeText(finding.explanation),
    finding.action,
  ].join("|");
}

function findingSet(values: readonly string[]): ReadonlySet<string> {
  return new Set(values);
}

function ratio(passed: number, total: number): number {
  if (total <= 0) return 1;
  return Number((passed / total).toFixed(6));
}

export function compareFindingSets(
  reference: readonly BenchmarkGroundTruthFinding[],
  actual: readonly BenchmarkActualFinding[],
): EvaluationSetAgreement {
  const referenceKeys = findingSet(reference.map((finding) => groundTruthFindingKey(finding)));
  const actualKeys = findingSet(actual.map((finding) => actualFindingKey(finding)));
  const union = new Set<string>([...referenceKeys, ...actualKeys]);

  let truePositiveCount = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;

  for (const key of union) {
    const inReference = referenceKeys.has(key);
    const inActual = actualKeys.has(key);
    if (inReference && inActual) {
      truePositiveCount++;
    } else if (inActual) {
      falsePositiveCount++;
    } else if (inReference) {
      falseNegativeCount++;
    }
  }

  return Object.freeze({
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision: ratio(truePositiveCount, truePositiveCount + falsePositiveCount),
    recall: ratio(truePositiveCount, truePositiveCount + falseNegativeCount),
    f1: ratio(
      2 * ratio(truePositiveCount, truePositiveCount + falsePositiveCount) * ratio(truePositiveCount, truePositiveCount + falseNegativeCount),
      ratio(truePositiveCount, truePositiveCount + falsePositiveCount) + ratio(truePositiveCount, truePositiveCount + falseNegativeCount)
    ),
  });
}

export function countFindingActions(findings: readonly BenchmarkActualFinding[]): Readonly<Record<BenchmarkFindingAction, number>> {
  const counts: Record<BenchmarkFindingAction, number> = {
    accept: 0,
    reject: 0,
    needs_review: 0,
  };

  for (const finding of findings) {
    counts[finding.action]++;
  }

  return Object.freeze({ ...counts });
}

