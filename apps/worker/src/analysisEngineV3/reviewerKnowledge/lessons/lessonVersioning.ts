import type { LessonVersion, ReviewerKnowledgeLesson } from "./lessonTypes.js";

export function normalizeLessonVersion(version: LessonVersion): LessonVersion {
  return Object.freeze({
    major: version.major,
    minor: version.minor,
    patch: version.patch,
  });
}

export function compareLessonVersion(left: LessonVersion, right: LessonVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function lessonVersionToString(version: LessonVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function compareLessonsByVersion(left: ReviewerKnowledgeLesson, right: ReviewerKnowledgeLesson): number {
  return left.id.localeCompare(right.id) || compareLessonVersion(left.version, right.version) || left.title.localeCompare(right.title);
}

export function selectActiveLessonVersion(lessons: readonly ReviewerKnowledgeLesson[], lessonId: string): ReviewerKnowledgeLesson | null {
  const matches = lessons.filter((lesson) => lesson.id === lessonId).sort((left, right) => compareLessonVersion(right.version, left.version));
  return matches[0] ?? null;
}

