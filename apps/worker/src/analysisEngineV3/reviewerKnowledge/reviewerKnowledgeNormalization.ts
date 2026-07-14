import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { validateReviewerKnowledgePack } from "./reviewerKnowledgeValidator.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function normalizeReviewerKnowledgePack(pack: ReviewerKnowledgePack): ReviewerKnowledgePack {
  const normalized: ReviewerKnowledgePack = Object.freeze({
    id: normalizeId(pack.id),
    module_id: normalizeId(pack.module_id),
    title: normalizeText(pack.title),
    default_question_set_id: pack.default_question_set_id === undefined
      ? undefined
      : pack.default_question_set_id === null
        ? null
        : normalizeId(pack.default_question_set_id),
    trigger_concept_ids: Object.freeze(uniqueSorted(pack.trigger_concept_ids).map((value) => value.toLowerCase())),
    purpose: normalizeText(pack.purpose),
    protected_interests: Object.freeze(uniqueSorted(pack.protected_interests)),
    protected_concepts: Object.freeze(uniqueSorted(pack.protected_concepts).map((value) => value.toLowerCase())),
    required_evidence: Object.freeze(uniqueSorted(pack.required_evidence)),
    insufficient_evidence: Object.freeze(uniqueSorted(pack.insufficient_evidence)),
    reviewer_heuristics: Object.freeze(uniqueSorted(pack.reviewer_heuristics)),
    legal_exceptions: Object.freeze(uniqueSorted(pack.legal_exceptions)),
    positive_examples: Object.freeze(uniqueSorted(pack.positive_examples)),
    negative_examples: Object.freeze(uniqueSorted(pack.negative_examples)),
    common_false_positives: Object.freeze(uniqueSorted(pack.common_false_positives)),
    glossary_relationships: Object.freeze(
      [...pack.glossary_relationships]
        .map((entry) => Object.freeze({
          term: normalizeText(entry.term),
          concept_id: entry.concept_id === null ? null : normalizeId(entry.concept_id),
          relation: normalizeText(entry.relation),
          note: entry.note === null ? null : normalizeText(entry.note),
        }))
        .sort((left, right) =>
          left.term.localeCompare(right.term) ||
          (left.concept_id ?? "").localeCompare(right.concept_id ?? "") ||
          left.relation.localeCompare(right.relation) ||
          (left.note ?? "").localeCompare(right.note ?? ""),
        ),
    ),
    article_mapping: Object.freeze(
      [...pack.article_mapping]
        .map((entry) => Object.freeze({
          article_id: entry.article_id,
          atom_ids: Object.freeze(uniqueSorted(entry.atom_ids).map((value) => normalizeId(value))),
          role: normalizeText(entry.role),
          note: entry.note === null ? null : normalizeText(entry.note),
        }))
        .sort((left, right) =>
          left.article_id - right.article_id ||
          left.role.localeCompare(right.role) ||
          (left.note ?? "").localeCompare(right.note ?? ""),
        ),
    ),
    reporting_guidance: Object.freeze(uniqueSorted(pack.reporting_guidance)),
  });

  const validation = validateReviewerKnowledgePack(normalized);
  if (!validation.valid) {
    const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid ReviewerKnowledgePack: ${message}`);
  }

  return normalized;
}

export function normalizeReviewerKnowledgePackId(value: string): string {
  return normalizeId(value);
}

export function normalizeReviewerKnowledgeText(value: string): string {
  return normalizeText(value);
}

export function uniqueSortedReviewerKnowledgeStrings(values: readonly string[]): readonly string[] {
  return uniqueSorted(values);
}
