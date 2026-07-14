import type { ReviewerAssessment, ReviewerMethodology, ReviewerMethodologyValidationIssue, ReviewerMethodologyValidationResult } from "./reviewerMethodologyTypes.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.normalize("NFC").trim().length > 0;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function validateStringList(path: string, value: readonly string[], issues: ReviewerMethodologyValidationIssue[]): void {
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      issues.push({ path: `${path}[${index}]`, message: "must be a non-empty string" });
    }
  });
}

export function validateReviewerMethodology(methodology: ReviewerMethodology): ReviewerMethodologyValidationResult {
  const issues: ReviewerMethodologyValidationIssue[] = [];
  if (!isNonEmptyString(methodology.id)) issues.push({ path: "id", message: "must be a non-empty string" });
  if (!isNonEmptyString(methodology.title)) issues.push({ path: "title", message: "must be a non-empty string" });
  if (!isNonEmptyString(methodology.purpose)) issues.push({ path: "purpose", message: "must be a non-empty string" });
  if (!Array.isArray(methodology.stages) || methodology.stages.length === 0) {
    issues.push({ path: "stages", message: "must contain at least one stage" });
  } else {
    methodology.stages.forEach((stage, index) => {
      if (!isNonEmptyString(stage.name)) issues.push({ path: `stages[${index}].name`, message: "must be a non-empty string" });
      if (!isNonEmptyString(stage.title)) issues.push({ path: `stages[${index}].title`, message: "must be a non-empty string" });
      if (!isNonEmptyString(stage.purpose)) issues.push({ path: `stages[${index}].purpose`, message: "must be a non-empty string" });
      validateStringList(`stages[${index}].inputs`, stage.inputs, issues);
      validateStringList(`stages[${index}].outputs`, stage.outputs, issues);
    });
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export function validateReviewerAssessment(assessment: ReviewerAssessment): ReviewerMethodologyValidationResult {
  const issues: ReviewerMethodologyValidationIssue[] = [];
  if (!isNonEmptyString(assessment.methodologyId)) issues.push({ path: "methodologyId", message: "must be a non-empty string" });
  if (!isNonEmptyString(assessment.methodologyTitle)) issues.push({ path: "methodologyTitle", message: "must be a non-empty string" });
  if (!isNonEmptyString(assessment.narrativeUnderstanding)) issues.push({ path: "narrativeUnderstanding", message: "must be a non-empty string" });
  if (!isNonEmptyString(assessment.narrativeIntent)) issues.push({ path: "narrativeIntent", message: "must be a non-empty string" });
  if (!isNonEmptyString(assessment.contextClassification)) issues.push({ path: "contextClassification", message: "must be a non-empty string" });
  if (!isNonEmptyString(assessment.literalVsImpliedMeaning)) issues.push({ path: "literalVsImpliedMeaning", message: "must be a non-empty string" });
  if (!Array.isArray(assessment.stageResults) || assessment.stageResults.length === 0) {
    issues.push({ path: "stageResults", message: "must contain at least one stage result" });
  }
  if (!Array.isArray(assessment.reasoningTrace)) {
    issues.push({ path: "reasoningTrace", message: "must be an array" });
  } else {
    validateStringList("reasoningTrace", assessment.reasoningTrace, issues);
  }
  if (!Array.isArray(assessment.applicableConceptIds)) {
    issues.push({ path: "applicableConceptIds", message: "must be an array" });
  } else {
    validateStringList("applicableConceptIds", assessment.applicableConceptIds, issues);
  }
  if (!Array.isArray(assessment.exceptionSignals)) {
    issues.push({ path: "exceptionSignals", message: "must be an array" });
  } else {
    validateStringList("exceptionSignals", assessment.exceptionSignals, issues);
  }
  if (!Number.isFinite(assessment.confidence) || assessment.confidence < 0 || assessment.confidence > 1) {
    issues.push({ path: "confidence", message: "must be a confidence value between 0 and 1" });
  }
  if (!Number.isFinite(assessment.conceptConfidence) || assessment.conceptConfidence < 0 || assessment.conceptConfidence > 1) {
    issues.push({ path: "conceptConfidence", message: "must be a confidence value between 0 and 1" });
  }
  if (!Number.isInteger(assessment.conceptCount) || assessment.conceptCount < 0) {
    issues.push({ path: "conceptCount", message: "must be a non-negative integer" });
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export function clampReviewerMethodologyConfidence(value: number): number {
  return clampConfidence(value);
}

