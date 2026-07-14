import type { ReviewerKnowledgeLesson } from "./lessonTypes.js";
import { normalizeLessonVersion } from "./lessonVersioning.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function normalizeReviewerKnowledgeLesson(lesson: ReviewerKnowledgeLesson): ReviewerKnowledgeLesson {
  return Object.freeze({
    id: normalizeId(lesson.id),
    title: normalizeText(lesson.title),
    version: normalizeLessonVersion(lesson.version),
    language: normalizeText(lesson.language).toLowerCase(),
    summary: normalizeText(lesson.summary),
    learningObjectives: Object.freeze(uniqueSorted(lesson.learningObjectives)),
    concepts: Object.freeze([...lesson.concepts].map((concept) => Object.freeze({
      id: normalizeId(concept.id),
      title: normalizeText(concept.title),
      summary: normalizeText(concept.summary),
      tags: Object.freeze(uniqueSorted(concept.tags)),
      target: concept.target === null ? null : normalizeText(concept.target),
      articleIds: Object.freeze([...new Set(concept.articleIds)].sort((left, right) => left - right)),
    })).sort((left, right) => left.id.localeCompare(right.id))),
    reviewerQuestions: Object.freeze([...lesson.reviewerQuestions].map((question) => Object.freeze({
      id: normalizeId(question.id),
      purpose: normalizeText(question.purpose),
      expectedAnswerFormat: normalizeText(question.expectedAnswerFormat),
      reasoningGuidance: normalizeText(question.reasoningGuidance),
      evidenceRequirements: Object.freeze(uniqueSorted(question.evidenceRequirements)),
    })).sort((left, right) => left.id.localeCompare(right.id))),
    examples: Object.freeze(uniqueSorted(lesson.examples)),
    counterExamples: Object.freeze(uniqueSorted(lesson.counterExamples)),
    exceptions: Object.freeze(uniqueSorted(lesson.exceptions)),
    evidenceRules: Object.freeze({
      minimum: Object.freeze(uniqueSorted(lesson.evidenceRules.minimum)),
      strong: Object.freeze(uniqueSorted(lesson.evidenceRules.strong)),
      weak: Object.freeze(uniqueSorted(lesson.evidenceRules.weak)),
      insufficient: Object.freeze(uniqueSorted(lesson.evidenceRules.insufficient)),
      confidenceGuidance: Object.freeze(uniqueSorted(lesson.evidenceRules.confidenceGuidance)),
    }),
    conceptRelationships: Object.freeze([...lesson.conceptRelationships].map((relationship) => Object.freeze({
      fromConceptId: normalizeId(relationship.fromConceptId),
      toConceptId: normalizeId(relationship.toConceptId),
      relation: normalizeText(relationship.relation),
      note: relationship.note == null ? null : normalizeText(relationship.note),
    })).sort((left, right) =>
      left.fromConceptId.localeCompare(right.fromConceptId) ||
      left.toConceptId.localeCompare(right.toConceptId) ||
      left.relation.localeCompare(right.relation) ||
      (left.note ?? "").localeCompare(right.note ?? ""),
    )),
    glossaryReferences: Object.freeze([...lesson.glossaryReferences].map((reference) => Object.freeze({
      term: normalizeText(reference.term),
      conceptId: reference.conceptId === null ? null : normalizeId(reference.conceptId),
      relation: normalizeText(reference.relation),
      note: reference.note == null ? null : normalizeText(reference.note),
    })).sort((left, right) =>
      left.term.localeCompare(right.term) ||
      (left.conceptId ?? "").localeCompare(right.conceptId ?? "") ||
      left.relation.localeCompare(right.relation) ||
      (left.note ?? "").localeCompare(right.note ?? ""),
    )),
    gcamMappings: Object.freeze([...lesson.gcamMappings].map((mapping) => Object.freeze({
      articleId: mapping.articleId,
      articleTitle: normalizeText(mapping.articleTitle),
      articleNumber: normalizeText(mapping.articleNumber),
      atomNumber: mapping.atomNumber === null ? null : normalizeText(mapping.atomNumber),
      reportTitle: normalizeText(mapping.reportTitle),
      note: mapping.note == null ? null : normalizeText(mapping.note),
    })).sort((left, right) =>
      left.articleId - right.articleId ||
      left.articleNumber.localeCompare(right.articleNumber) ||
      (left.atomNumber ?? "").localeCompare(right.atomNumber ?? "") ||
      left.reportTitle.localeCompare(right.reportTitle),
    )),
    reportTemplates: Object.freeze([...lesson.reportTemplates].map((template) => Object.freeze({
      findingTitle: normalizeText(template.findingTitle),
      reasonTemplate: normalizeText(template.reasonTemplate),
      recommendationTemplate: normalizeText(template.recommendationTemplate),
      severity: template.severity,
      priority: template.priority,
      reportCategory: normalizeText(template.reportCategory),
    })).sort((left, right) =>
      left.reportCategory.localeCompare(right.reportCategory) ||
      left.priority - right.priority ||
      left.findingTitle.localeCompare(right.findingTitle),
    )),
    benchmarkReferences: Object.freeze(uniqueSorted(lesson.benchmarkReferences)),
    prerequisites: Object.freeze(uniqueSorted(lesson.prerequisites)),
    relatedLessons: Object.freeze(uniqueSorted(lesson.relatedLessons)),
    metadata: Object.freeze(lesson.metadata),
  });
}
