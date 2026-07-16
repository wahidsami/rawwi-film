function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return clampConfidence(values.reduce((sum, value) => sum + clampConfidence(value), 0) / values.length);
}

export type ConfidenceCalibrationInput = Readonly<{
  baseConfidence: number;
  semanticConfidence: number;
  knowledgeConfidence: number;
  precedentAgreement: number;
  reviewerAgreement: number;
  evidenceQuality: number;
  counterEvidence: number;
  narrativeAmbiguity: number;
  consensusScore: number;
  disagreementScore: number;
}>;

export type ConfidenceCalibrationReport = Readonly<{
  baseConfidence: number;
  semanticConfidence: number;
  knowledgeConfidence: number;
  precedentAgreement: number;
  reviewerAgreement: number;
  evidenceQuality: number;
  counterEvidence: number;
  narrativeAmbiguity: number;
  consensusScore: number;
  disagreementScore: number;
  positiveAverage: number;
  negativeAverage: number;
  adjustedSignal: number;
  confidence: number;
  adjustment: number;
  cappedAtMaximum: boolean;
}>;

export function calibrateConfidence(input: ConfidenceCalibrationInput): ConfidenceCalibrationReport {
  const semanticConfidence = clampConfidence(input.semanticConfidence);
  const knowledgeConfidence = clampConfidence(input.knowledgeConfidence);
  const precedentAgreement = clampConfidence(input.precedentAgreement);
  const reviewerAgreement = clampConfidence(input.reviewerAgreement);
  const evidenceQuality = clampConfidence(input.evidenceQuality);
  const counterEvidence = clampConfidence(input.counterEvidence);
  const narrativeAmbiguity = clampConfidence(input.narrativeAmbiguity);
  const consensusScore = clampConfidence(input.consensusScore);
  const disagreementScore = clampConfidence(input.disagreementScore);
  const positiveAverage = average([
    semanticConfidence,
    knowledgeConfidence,
    precedentAgreement,
    reviewerAgreement,
    evidenceQuality,
    consensusScore,
  ]);
  const negativeAverage = average([
    counterEvidence,
    narrativeAmbiguity,
    disagreementScore,
  ]);
  const positiveSignal = Math.pow(positiveAverage, 1.4);
  const adjustedSignal = clampConfidence(Math.max(0, positiveSignal - (negativeAverage * 0.35)));
  const rawConfidence = 0.55 + 0.43 * adjustedSignal;
  const confidence = Number(Math.min(0.98, Math.max(0.55, rawConfidence)).toFixed(6));
  const adjustment = Number((confidence / Math.max(0.001, clampConfidence(input.baseConfidence))).toFixed(6));

  return Object.freeze({
    baseConfidence: clampConfidence(input.baseConfidence),
    semanticConfidence,
    knowledgeConfidence,
    precedentAgreement,
    reviewerAgreement,
    evidenceQuality,
    counterEvidence,
    narrativeAmbiguity,
    consensusScore,
    disagreementScore,
    positiveAverage,
    negativeAverage,
    adjustedSignal,
    confidence,
    adjustment,
    cappedAtMaximum: confidence >= 0.98,
  });
}
