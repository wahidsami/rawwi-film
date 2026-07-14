import type { LessonDependencyGraph, LessonValidationIssue, LessonValidationResult, ReviewerKnowledgeLesson } from "./lessonTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function message(severity: "error" | "warning", code: string, path: string, message: string): LessonValidationIssue {
  return Object.freeze({ severity, code, path, message });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && normalizeText(value).length > 0;
}

function validateRequiredList(path: string, value: readonly string[] | undefined, issues: LessonValidationIssue[], errorCode: string, warningCode?: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(message("error", errorCode, path, "must contain at least one item"));
    return;
  }
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      issues.push(message("error", `${errorCode}.item`, `${path}[${index}]`, "must be a non-empty string"));
    }
  });
  if (warningCode && value.length < 2) {
    issues.push(message("warning", warningCode, path, "should contain more than one item for reuse"));
  }
}

export function validateReviewerKnowledgeLesson(lesson: ReviewerKnowledgeLesson): LessonValidationResult {
  const issues: LessonValidationIssue[] = [];

  if (!isNonEmptyString(lesson.id)) issues.push(message("error", "lesson.id.missing", "id", "must be a non-empty string"));
  if (!isNonEmptyString(lesson.title)) issues.push(message("error", "lesson.title.missing", "title", "must be a non-empty string"));
  if (!Number.isInteger(lesson.version.major) || !Number.isInteger(lesson.version.minor) || !Number.isInteger(lesson.version.patch)) {
    issues.push(message("error", "lesson.version.invalid", "version", "must be a deterministic semantic version"));
  }
  if (!isNonEmptyString(lesson.language)) issues.push(message("error", "lesson.language.missing", "language", "must be a non-empty string"));
  if (!isNonEmptyString(lesson.summary)) issues.push(message("error", "lesson.summary.missing", "summary", "must be a non-empty string"));

  validateRequiredList("learningObjectives", lesson.learningObjectives, issues, "lesson.learningObjectives.missing");
  if (!Array.isArray(lesson.concepts) || lesson.concepts.length === 0) {
    issues.push(message("error", "lesson.concepts.missing", "concepts", "must contain at least one concept"));
  }
  validateRequiredList("reviewerQuestions", lesson.reviewerQuestions.map((question) => question.id), issues, "lesson.reviewerQuestions.missing");
  validateRequiredList("examples", lesson.examples, issues, "lesson.examples.missing");
  validateRequiredList("counterExamples", lesson.counterExamples, issues, "lesson.counterExamples.missing");
  validateRequiredList("exceptions", lesson.exceptions, issues, "lesson.exceptions.missing");

  if (!lesson.evidenceRules || !Array.isArray(lesson.evidenceRules.minimum) || lesson.evidenceRules.minimum.length === 0) {
    issues.push(message("error", "lesson.evidenceRules.minimum.missing", "evidenceRules.minimum", "must contain minimum evidence"));
  }
  if (!Array.isArray(lesson.evidenceRules.strong) || lesson.evidenceRules.strong.length === 0) {
    issues.push(message("error", "lesson.evidenceRules.strong.missing", "evidenceRules.strong", "must contain strong evidence"));
  }
  if (!Array.isArray(lesson.evidenceRules.weak) || lesson.evidenceRules.weak.length === 0) {
    issues.push(message("error", "lesson.evidenceRules.weak.missing", "evidenceRules.weak", "must contain weak evidence"));
  }
  if (!Array.isArray(lesson.evidenceRules.insufficient) || lesson.evidenceRules.insufficient.length === 0) {
    issues.push(message("error", "lesson.evidenceRules.insufficient.missing", "evidenceRules.insufficient", "must contain insufficient evidence"));
  }
  if (!Array.isArray(lesson.evidenceRules.confidenceGuidance) || lesson.evidenceRules.confidenceGuidance.length === 0) {
    issues.push(message("error", "lesson.evidenceRules.confidenceGuidance.missing", "evidenceRules.confidenceGuidance", "must contain confidence guidance"));
  }

  if (!Array.isArray(lesson.gcamMappings) || lesson.gcamMappings.length === 0) {
    issues.push(message("warning", "lesson.gcamMappings.missing", "gcamMappings", "should contain at least one GCAM mapping"));
  }
  if (!Array.isArray(lesson.reportTemplates) || lesson.reportTemplates.length === 0) {
    issues.push(message("error", "lesson.reportTemplates.missing", "reportTemplates", "must contain at least one report template"));
  }

  if (!Array.isArray(lesson.benchmarkReferences)) {
    issues.push(message("error", "lesson.benchmarkReferences.invalid", "benchmarkReferences", "must be an array"));
  }
  if (!Array.isArray(lesson.prerequisites)) {
    issues.push(message("error", "lesson.prerequisites.invalid", "prerequisites", "must be an array"));
  }
  if (!Array.isArray(lesson.relatedLessons)) {
    issues.push(message("error", "lesson.relatedLessons.invalid", "relatedLessons", "must be an array"));
  }

  return Object.freeze({
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues: Object.freeze(issues.sort((left, right) =>
      left.severity.localeCompare(right.severity) ||
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
    )),
  });
}

export function validateLessonDependencyGraph(graph: LessonDependencyGraph): LessonValidationResult {
  const issues: LessonValidationIssue[] = [];
  for (const issue of graph.missingReferences) {
    issues.push(message("error", issue.code, issue.path, issue.message));
  }
  for (const issue of graph.duplicateDependencies) {
    issues.push(message("error", issue.code, issue.path, issue.message));
  }
  for (const cycle of graph.cycles) {
    issues.push(message("error", "dependency.cycle", `cycles[${cycle.join("->")}]`, "lesson dependency cycle detected"));
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}
