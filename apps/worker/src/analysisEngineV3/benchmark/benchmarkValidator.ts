import type { BenchmarkCase, BenchmarkReport } from "./benchmarkTypes.js";

export type BenchmarkValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type BenchmarkValidationResult = Readonly<{
  valid: boolean;
  issues: readonly BenchmarkValidationIssue[];
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.normalize("NFC").trim().length > 0;
}

function validateConfidenceRange(path: string, value: BenchmarkCase["expectedConfidenceRange"], issues: BenchmarkValidationIssue[]): void {
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) {
    issues.push({ path, message: "confidence range must be finite numbers" });
    return;
  }
  if (value.min < 0 || value.max > 1 || value.min > value.max) {
    issues.push({ path, message: "confidence range must satisfy 0 <= min <= max <= 1" });
  }
}

function validateStringList(path: string, value: readonly string[] | undefined, issues: BenchmarkValidationIssue[], allowEmpty = false): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push({ path, message: allowEmpty ? "must be an array" : "must contain at least one item" });
    return;
  }
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      issues.push({ path: `${path}[${index}]`, message: "must be a non-empty string" });
    }
  });
}

function validateBenchmarkCaseItem(candidate: BenchmarkCase, index: number, issues: BenchmarkValidationIssue[]): void {
  const path = `cases[${index}]`;
  if (!isNonEmptyString(candidate.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty string" });
  if (!isNonEmptyString(candidate.title)) issues.push({ path: `${path}.title`, message: "must be a non-empty string" });
  if (!isNonEmptyString(candidate.scriptSnippet)) issues.push({ path: `${path}.scriptSnippet`, message: "must be a non-empty string" });
  validateStringList(`${path}.neighboringSentences`, candidate.neighboringSentences, issues, true);
  if (!candidate.glossary || !isNonEmptyString(candidate.glossary.title)) {
    issues.push({ path: `${path}.glossary.title`, message: "must be a valid glossary object" });
  }
  if (!candidate.subjectModule || !isNonEmptyString(candidate.subjectModule.id) || !isNonEmptyString(candidate.subjectModule.titleAr)) {
    issues.push({ path: `${path}.subjectModule`, message: "must be a valid subject module" });
  }
  validateStringList(`${path}.expectedConcepts`, candidate.expectedConcepts, issues, true);
  if (!isNonEmptyString(candidate.expectedLegalModule)) issues.push({ path: `${path}.expectedLegalModule`, message: "must be a non-empty string" });
  validateStringList(`${path}.expectedArticleMapping`, candidate.expectedArticleMapping.map((value) => String(value)), issues, true);
  if (!candidate.expectedFinding || !isNonEmptyString(candidate.expectedFinding.summary)) {
    issues.push({ path: `${path}.expectedFinding.summary`, message: "must be a valid finding" });
  }
  if (!isNonEmptyString(candidate.expectedExplanation)) issues.push({ path: `${path}.expectedExplanation`, message: "must be a non-empty string" });
  validateConfidenceRange(`${path}.expectedConfidenceRange`, candidate.expectedConfidenceRange, issues);

  const assessment = candidate.expectedReviewerAssessment;
  if (!assessment || !isNonEmptyString(assessment.narrativeUnderstanding)) {
    issues.push({ path: `${path}.expectedReviewerAssessment`, message: "must be a valid reviewer assessment" });
    return;
  }
  validateStringList(`${path}.expectedReviewerAssessment.exceptionSignals`, assessment.exceptionSignals, issues, true);
}

export class BenchmarkValidator {
  validateCases(cases: readonly BenchmarkCase[]): BenchmarkValidationResult {
    const issues: BenchmarkValidationIssue[] = [];
    if (!Array.isArray(cases) || cases.length === 0) {
      issues.push({ path: "cases", message: "must contain at least one benchmark case" });
    } else {
      cases.forEach((candidate, index) => validateBenchmarkCaseItem(candidate, index, issues));
    }
    return Object.freeze({
      valid: issues.length === 0,
      issues: Object.freeze(issues),
    });
  }

  validateReport(report: BenchmarkReport): BenchmarkValidationResult {
    const issues: BenchmarkValidationIssue[] = [];
    if (!report || !Array.isArray(report.cases)) {
      issues.push({ path: "report", message: "must be a valid benchmark report" });
    } else {
      if (report.score.totalCases !== report.cases.length) {
        issues.push({ path: "score.totalCases", message: "must equal the number of case results" });
      }
    }
    return Object.freeze({
      valid: issues.length === 0,
      issues: Object.freeze(issues),
    });
  }
}

export function createBenchmarkValidator(): BenchmarkValidator {
  return new BenchmarkValidator();
}
