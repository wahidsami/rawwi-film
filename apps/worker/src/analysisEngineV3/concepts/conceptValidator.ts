import type { ConceptContext } from "./conceptTypes.js";
import type { ConceptValidationResult } from "./conceptValidationTypes.js";

function addIssue(issues: Array<{ path: string; message: string }>, path: string, message: string): void {
  issues.push({ path, message });
}

function isValidNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidConceptId(value: string): boolean {
  return /^[a-z0-9_]+$/.test(value);
}

export function validateConceptContext(context: ConceptContext): ConceptValidationResult {
  const issues: Array<{ path: string; message: string }> = [];

  if (context.concepts.length !== context.conceptIds.length) {
    addIssue(issues, "conceptIds", "conceptIds must align with concepts");
  }

  if (context.primaryConceptId !== null && !context.conceptIds.includes(context.primaryConceptId)) {
    addIssue(issues, "primaryConceptId", "primaryConceptId must reference an existing concept");
  }

  if (!isValidNumber(context.confidence)) {
    addIssue(issues, "confidence", "confidence must be between 0 and 1");
  }

  for (const concept of context.concepts) {
    if (!concept.id.trim()) addIssue(issues, `concepts.${concept.id}.id`, "concept id is required");
    if (!isValidConceptId(concept.id)) addIssue(issues, `concepts.${concept.id}.id`, "concept id must be canonical lowercase snake_case");
    if (!concept.label.trim()) addIssue(issues, `concepts.${concept.id}.label`, "concept label is required");
    if (!isValidNumber(concept.confidence.total)) addIssue(issues, `concepts.${concept.id}.confidence.total`, "concept confidence must be between 0 and 1");
    if (concept.evidenceSources.some((source) => !source.sourceText.trim())) addIssue(issues, `concepts.${concept.id}.evidenceSources`, "evidence source text is required");
    if (concept.originatingSentences.some((sentence) => !sentence.trim())) addIssue(issues, `concepts.${concept.id}.originatingSentences`, "originating sentences must be non-empty");
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze([...issues]),
  });
}
