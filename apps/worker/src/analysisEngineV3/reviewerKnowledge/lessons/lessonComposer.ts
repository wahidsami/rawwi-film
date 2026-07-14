import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import { normalizeReviewerKnowledgePack } from "../reviewerKnowledgeNormalization.js";
import type { LessonPackBlueprint, ReviewerKnowledgeLesson } from "./lessonTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((left, right) => left - right));
}

function mergeStrings(lessons: readonly ReviewerKnowledgeLesson[], selector: (lesson: ReviewerKnowledgeLesson) => readonly string[]): readonly string[] {
  return Object.freeze(uniqueSorted(lessons.flatMap((lesson) => [...selector(lesson)])));
}

export function composeReviewerKnowledgePack(blueprint: LessonPackBlueprint, lessons: readonly ReviewerKnowledgeLesson[]): ReviewerKnowledgePack {
  const normalizedLessons = [...lessons].sort((left, right) => left.id.localeCompare(right.id));
  const conceptIds = uniqueSorted([
    ...blueprint.trigger_concept_ids,
    ...normalizedLessons.flatMap((lesson) => lesson.concepts.map((concept) => concept.id)),
  ]);
  const articleMappings = Object.freeze(normalizedLessons.flatMap((lesson) => lesson.gcamMappings.map((mapping) => Object.freeze({
    article_id: mapping.articleId,
    atom_ids: Object.freeze(mapping.atomNumber ? [mapping.atomNumber] : []),
    role: mapping.reportTitle,
    note: mapping.note,
  }))));
  const glossaryRelationships = Object.freeze(normalizedLessons.flatMap((lesson) => lesson.glossaryReferences.map((reference) => Object.freeze({
    term: reference.term,
    concept_id: reference.conceptId,
    relation: reference.relation,
    note: reference.note,
  }))));
  const reportingGuidance = uniqueSorted([
    ...normalizedLessons.flatMap((lesson) => lesson.reportTemplates.flatMap((template) => [
      template.findingTitle,
      template.reasonTemplate,
      template.recommendationTemplate,
    ])),
    ...normalizedLessons.flatMap((lesson) => lesson.evidenceRules.confidenceGuidance),
    blueprint.summary ?? blueprint.purpose,
  ]);

  return normalizeReviewerKnowledgePack(Object.freeze({
    id: normalizeId(blueprint.id),
    module_id: normalizeId(blueprint.module_id),
    title: normalizeText(blueprint.title),
    default_question_set_id: blueprint.default_question_set_id === undefined ? undefined : blueprint.default_question_set_id === null ? null : normalizeId(blueprint.default_question_set_id),
    trigger_concept_ids: Object.freeze(conceptIds),
    purpose: normalizeText(blueprint.purpose),
    protected_interests: Object.freeze(uniqueSorted(blueprint.protected_interests)),
    protected_concepts: Object.freeze(uniqueSorted([
      ...blueprint.protected_concepts,
      ...normalizedLessons.flatMap((lesson) => lesson.concepts.map((concept) => concept.title)),
    ])),
    required_evidence: mergeStrings(normalizedLessons, (lesson) => [
      ...lesson.evidenceRules.minimum,
      ...lesson.evidenceRules.strong,
      ...lesson.evidenceRules.weak,
    ]),
    insufficient_evidence: mergeStrings(normalizedLessons, (lesson) => lesson.evidenceRules.insufficient),
    reviewer_heuristics: mergeStrings(normalizedLessons, (lesson) => [
      lesson.summary,
      ...lesson.learningObjectives,
      ...lesson.evidenceRules.confidenceGuidance,
    ]),
    legal_exceptions: mergeStrings(normalizedLessons, (lesson) => lesson.exceptions),
    positive_examples: mergeStrings(normalizedLessons, (lesson) => lesson.examples),
    negative_examples: mergeStrings(normalizedLessons, (lesson) => lesson.counterExamples),
    common_false_positives: mergeStrings(normalizedLessons, (lesson) => lesson.counterExamples),
    glossary_relationships: glossaryRelationships,
    article_mapping: articleMappings,
    reporting_guidance: Object.freeze(reportingGuidance),
  }));
}

