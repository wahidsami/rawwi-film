import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";

export type ReviewerKnowledgeValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ReviewerKnowledgeValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ReviewerKnowledgeValidationIssue[];
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.normalize("NFC").trim().length > 0;
}

function validateStringList(path: string, value: readonly string[] | undefined, issues: ReviewerKnowledgeValidationIssue[], allowEmpty = false): void {
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

function validatePackObject(path: string, value: ReviewerKnowledgePack["article_mapping"][number] | ReviewerKnowledgePack["glossary_relationships"][number], issues: ReviewerKnowledgeValidationIssue[]): void {
  if ("article_id" in value) {
    if (!Number.isInteger(value.article_id) || value.article_id <= 0) {
      issues.push({ path: `${path}.article_id`, message: "must be a positive integer" });
    }
    if (Array.isArray(value.atom_ids)) {
      value.atom_ids.forEach((atomId, index) => {
        if (!isNonEmptyString(atomId)) {
          issues.push({ path: `${path}.atom_ids[${index}]`, message: "must be a non-empty string" });
        }
      });
    }
    if (!isNonEmptyString(value.role)) issues.push({ path: `${path}.role`, message: "must be a non-empty string" });
    if (value.note !== null && !isNonEmptyString(value.note)) issues.push({ path: `${path}.note`, message: "must be null or a non-empty string" });
    return;
  }

  if (!isNonEmptyString(value.term)) issues.push({ path: `${path}.term`, message: "must be a non-empty string" });
  if (value.concept_id !== null && !isNonEmptyString(value.concept_id)) issues.push({ path: `${path}.concept_id`, message: "must be null or a non-empty string" });
  if (!isNonEmptyString(value.relation)) issues.push({ path: `${path}.relation`, message: "must be a non-empty string" });
  if (value.note !== null && !isNonEmptyString(value.note)) issues.push({ path: `${path}.note`, message: "must be null or a non-empty string" });
}

export function validateReviewerKnowledgePack(pack: ReviewerKnowledgePack): ReviewerKnowledgeValidationResult {
  const issues: ReviewerKnowledgeValidationIssue[] = [];

  if (!isNonEmptyString(pack.id)) issues.push({ path: "id", message: "must be a non-empty string" });
  if (!isNonEmptyString(pack.module_id)) issues.push({ path: "module_id", message: "must be a non-empty string" });
  if (!isNonEmptyString(pack.title)) issues.push({ path: "title", message: "must be a non-empty string" });
  if (!isNonEmptyString(pack.purpose)) issues.push({ path: "purpose", message: "must be a non-empty string" });
  validateStringList("trigger_concept_ids", pack.trigger_concept_ids, issues, true);
  validateStringList("protected_interests", pack.protected_interests, issues);
  validateStringList("protected_concepts", pack.protected_concepts, issues);
  validateStringList("required_evidence", pack.required_evidence, issues);
  validateStringList("insufficient_evidence", pack.insufficient_evidence, issues);
  validateStringList("reviewer_heuristics", pack.reviewer_heuristics, issues);
  validateStringList("legal_exceptions", pack.legal_exceptions, issues);
  validateStringList("positive_examples", pack.positive_examples, issues);
  validateStringList("negative_examples", pack.negative_examples, issues);
  validateStringList("common_false_positives", pack.common_false_positives, issues);
  validateStringList("reporting_guidance", pack.reporting_guidance, issues);

  if (!Array.isArray(pack.glossary_relationships)) {
    issues.push({ path: "glossary_relationships", message: "must be an array" });
  } else {
    pack.glossary_relationships.forEach((entry, index) => validatePackObject(`glossary_relationships[${index}]`, entry, issues));
  }

  if (!Array.isArray(pack.article_mapping)) {
    issues.push({ path: "article_mapping", message: "must be an array" });
  } else {
    pack.article_mapping.forEach((entry, index) => validatePackObject(`article_mapping[${index}]`, entry, issues));
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}
