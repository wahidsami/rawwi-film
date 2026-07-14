import type { LessonSearchQuery, LessonSearchResult, ReviewerKnowledgeLesson } from "./lessonTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function include(haystack: string, needle: string | null | undefined): boolean {
  return typeof needle === "string" && needle.trim().length > 0 && haystack.includes(normalizeText(needle));
}

function lessonText(lesson: ReviewerKnowledgeLesson): string {
  return [
    lesson.id,
    lesson.title,
    lesson.language,
    lesson.summary,
    ...lesson.learningObjectives,
    ...lesson.concepts.flatMap((concept) => [concept.id, concept.title, concept.summary, ...concept.tags, concept.target ?? ""]),
    ...lesson.reviewerQuestions.flatMap((question) => [question.id, question.purpose, question.expectedAnswerFormat, question.reasoningGuidance, ...question.evidenceRequirements]),
    ...lesson.examples,
    ...lesson.counterExamples,
    ...lesson.exceptions,
    ...lesson.evidenceRules.minimum,
    ...lesson.evidenceRules.strong,
    ...lesson.evidenceRules.weak,
    ...lesson.evidenceRules.insufficient,
    ...lesson.evidenceRules.confidenceGuidance,
    ...lesson.conceptRelationships.flatMap((relationship) => [relationship.fromConceptId, relationship.toConceptId, relationship.relation, relationship.note ?? ""]),
    ...lesson.glossaryReferences.flatMap((reference) => [reference.term, reference.conceptId ?? "", reference.relation, reference.note ?? ""]),
    ...lesson.gcamMappings.flatMap((mapping) => [String(mapping.articleId), mapping.articleTitle, mapping.articleNumber, mapping.atomNumber ?? "", mapping.reportTitle, mapping.note ?? ""]),
    ...lesson.reportTemplates.flatMap((template) => [template.findingTitle, template.reasonTemplate, template.recommendationTemplate, template.severity, String(template.priority), template.reportCategory]),
    ...lesson.benchmarkReferences,
    ...lesson.prerequisites,
    ...lesson.relatedLessons,
    ...Object.entries(lesson.metadata).flatMap(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value ?? "")]),
  ].join(" ").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function searchLessons(lessons: readonly ReviewerKnowledgeLesson[], query: LessonSearchQuery): readonly LessonSearchResult[] {
  const lessonIdQuery = normalizeText(query.lessonId ?? "");
  const needle = normalizeText([
    query.lessonId,
    query.concept,
    query.target,
    query.keyword,
    query.tag,
    query.subject,
    query.gcamArticle === null || query.gcamArticle === undefined ? "" : String(query.gcamArticle),
  ].filter(Boolean).join(" "));

  const results: LessonSearchResult[] = [];
  for (const lesson of lessons) {
    const reasons: string[] = [];
    let score = 0;
    const text = lessonText(lesson);
    const isExactLessonMatch = lessonIdQuery.length > 0 && normalizeText(lesson.id) === lessonIdQuery;

    if (isExactLessonMatch) {
      score += 2000;
      reasons.push("lesson id");
    } else if (include(text, query.lessonId)) {
      score += 1000;
      reasons.push("lesson id");
    }
    if (query.concept && lesson.concepts.some((concept) => include(normalizeText(concept.id), query.concept) || include(normalizeText(concept.title), query.concept) || include(normalizeText(concept.summary), query.concept) || concept.tags.some((tag) => include(normalizeText(tag), query.concept)))) {
      score += 300;
      reasons.push("concept");
    }
    if (query.target && lesson.concepts.some((concept) => include(normalizeText(concept.target ?? ""), query.target))) {
      score += 200;
      reasons.push("target");
    }
    if (typeof query.gcamArticle === "number" && lesson.gcamMappings.some((mapping) => mapping.articleId === query.gcamArticle)) {
      score += 250;
      reasons.push("GCAM article");
    }
    if (query.tag && lesson.concepts.some((concept) => concept.tags.some((tag) => include(normalizeText(tag), query.tag)))) {
      score += 150;
      reasons.push("tag");
    }
    if (query.subject && include(normalizeText(lesson.metadata.subject ?? ""), query.subject)) {
      score += 100;
      reasons.push("subject");
    }
    if (needle.length > 0 && text.includes(needle)) {
      score += 50;
      reasons.push("keyword");
    }

    if (score > 0) {
      results.push(Object.freeze({ lesson, score, reasons: Object.freeze([...new Set(reasons)].sort((left, right) => left.localeCompare(right))) }));
    }
  }

  return Object.freeze(results.sort((left, right) =>
    Number((right.lesson.id === lessonIdQuery && right.reasons.includes("lesson id")) ? 1 : 0) - Number((left.lesson.id === lessonIdQuery && left.reasons.includes("lesson id")) ? 1 : 0) ||
    right.score - left.score ||
    left.lesson.id.localeCompare(right.lesson.id) ||
    left.lesson.version.major - right.lesson.version.major ||
    left.lesson.version.minor - right.lesson.version.minor ||
    left.lesson.version.patch - right.lesson.version.patch,
  ));
}
