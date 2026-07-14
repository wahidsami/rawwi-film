import type { ReviewerQuestion, ReviewerQuestionSet } from "./reviewerQuestionTypes.js";

export type ReviewerQuestionValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ReviewerQuestionValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ReviewerQuestionValidationIssue[];
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.normalize("NFC").trim().length > 0;
}

function validateStringArray(path: string, value: readonly string[] | undefined, issues: ReviewerQuestionValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }

  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      issues.push({ path: `${path}[${index}]`, message: "must be a non-empty string" });
    }
  });
}

function validateQuestion(question: ReviewerQuestion, index: number, issues: ReviewerQuestionValidationIssue[]): void {
  const path = `questions[${index}]`;
  if (!isNonEmptyString(question.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty string" });
  if (!isNonEmptyString(question.category)) issues.push({ path: `${path}.category`, message: "must be a non-empty string" });
  if (!isNonEmptyString(question.purpose)) issues.push({ path: `${path}.purpose`, message: "must be a non-empty string" });
  if (!isNonEmptyString(question.expectedAnswerFormat)) issues.push({ path: `${path}.expectedAnswerFormat`, message: "must be a non-empty string" });
  if (!isNonEmptyString(question.reasoningGuidance)) issues.push({ path: `${path}.reasoningGuidance`, message: "must be a non-empty string" });
  validateStringArray(`${path}.evidenceRequirements`, question.evidenceRequirements, issues);
}

export function validateReviewerQuestionSet(questionSet: ReviewerQuestionSet): ReviewerQuestionValidationResult {
  const issues: ReviewerQuestionValidationIssue[] = [];
  if (!isNonEmptyString(questionSet.id)) issues.push({ path: "id", message: "must be a non-empty string" });
  if (!isNonEmptyString(questionSet.version)) issues.push({ path: "version", message: "must be a non-empty string" });
  if (!isNonEmptyString(questionSet.title)) issues.push({ path: "title", message: "must be a non-empty string" });
  if (!isNonEmptyString(questionSet.description)) issues.push({ path: "description", message: "must be a non-empty string" });
  validateStringArray("defaultQuestionIds", questionSet.defaultQuestionIds, issues);
  validateStringArray("notes", questionSet.notes, issues);

  if (!Array.isArray(questionSet.questions) || questionSet.questions.length === 0) {
    issues.push({ path: "questions", message: "must contain at least one item" });
  } else {
    questionSet.questions.forEach((question, index) => validateQuestion(question, index, issues));
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

