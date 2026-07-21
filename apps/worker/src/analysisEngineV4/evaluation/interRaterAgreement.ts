import type { BenchmarkActualFinding, BenchmarkGroundTruthFinding } from "../benchmark/benchmarkTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function groundTruthKey(finding: BenchmarkGroundTruthFinding): string {
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

function actualKey(finding: BenchmarkActualFinding): string {
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

function binaryUnion(reference: readonly string[], actual: readonly string[]): readonly string[] {
  return Object.freeze([...new Set([...reference, ...actual])].sort((left, right) => left.localeCompare(right)));
}

export type CohenKappaResult = Readonly<{
  observedAgreement: number;
  expectedAgreement: number;
  kappa: number;
  totalItems: number;
  positiveAgreementCount: number;
  negativeAgreementCount: number;
  disagreementCount: number;
}>;

export function computeCohenKappa(
  reference: readonly BenchmarkGroundTruthFinding[],
  actual: readonly BenchmarkActualFinding[],
): CohenKappaResult {
  const referenceKeys = reference.map((finding) => groundTruthKey(finding));
  const actualKeys = actual.map((finding) => actualKey(finding));
  const universe = binaryUnion(referenceKeys, actualKeys);

  let positiveAgreementCount = 0;
  let negativeAgreementCount = 0;
  let disagreementCount = 0;
  let referencePositiveCount = 0;
  let actualPositiveCount = 0;

  for (const key of universe) {
    const inReference = referenceKeys.includes(key);
    const inActual = actualKeys.includes(key);
    if (inReference) referencePositiveCount++;
    if (inActual) actualPositiveCount++;

    if (inReference && inActual) {
      positiveAgreementCount++;
    } else if (!inReference && !inActual) {
      negativeAgreementCount++;
    } else {
      disagreementCount++;
    }
  }

  const totalItems = universe.length;
  const observedAgreement = totalItems === 0 ? 1 : Number(((positiveAgreementCount + negativeAgreementCount) / totalItems).toFixed(6));
  const referencePositiveRate = totalItems === 0 ? 0 : referencePositiveCount / totalItems;
  const actualPositiveRate = totalItems === 0 ? 0 : actualPositiveCount / totalItems;
  const expectedAgreement = Number((referencePositiveRate * actualPositiveRate + (1 - referencePositiveRate) * (1 - actualPositiveRate)).toFixed(6));
  const denominator = 1 - expectedAgreement;
  const kappa = denominator === 0 ? 1 : Number(((observedAgreement - expectedAgreement) / denominator).toFixed(6));

  return Object.freeze({
    observedAgreement,
    expectedAgreement,
    kappa,
    totalItems,
    positiveAgreementCount,
    negativeAgreementCount,
    disagreementCount,
  });
}

export function averageKappa(results: readonly CohenKappaResult[]): number {
  if (results.length === 0) return 1;
  return Number((results.reduce((sum, item) => sum + item.kappa, 0) / results.length).toFixed(6));
}

