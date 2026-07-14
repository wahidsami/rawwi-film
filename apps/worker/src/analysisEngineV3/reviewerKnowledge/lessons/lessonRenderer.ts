import type { LessonPackBlueprint, ReviewerKnowledgeLesson } from "./lessonTypes.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

export function stableSerializeLessonValue(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

export function renderReviewerKnowledgeLesson(lesson: ReviewerKnowledgeLesson): string {
  return `### ${lesson.title}\n${stableSerializeLessonValue(lesson)}`;
}

export function renderReviewerKnowledgeLessons(lessons: readonly ReviewerKnowledgeLesson[]): string {
  return lessons.length === 0 ? "- (none)" : lessons.map((lesson) => renderReviewerKnowledgeLesson(lesson)).join("\n\n");
}

export function renderLessonCompositionSummary(blueprint: LessonPackBlueprint, lessons: readonly ReviewerKnowledgeLesson[]): string {
  return stableSerializeLessonValue({
    blueprint,
    lesson_ids: lessons.map((lesson) => lesson.id),
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      version: lesson.version,
      concepts: lesson.concepts.map((concept) => concept.id),
    })),
  });
}

