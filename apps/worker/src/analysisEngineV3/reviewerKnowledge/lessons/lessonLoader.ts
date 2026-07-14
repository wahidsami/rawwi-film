import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseReviewerKnowledgeDocumentText } from "../reviewerKnowledgeIO.js";
import { parseReviewerKnowledgeLesson, parseReviewerKnowledgeLessonInput } from "./lessonSchema.js";
import { normalizeReviewerKnowledgeLesson } from "./lessonNormalizer.js";
import type { ReviewerKnowledgeLesson, ReviewerKnowledgeLessonDocument } from "./lessonTypes.js";
import { createLessonRegistry } from "./lessonRegistry.js";

const LESSON_FILE_PATTERN = /^lesson.*\.v\d+\.(?:json|ya?ml)$/i;

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function discoverLessonFiles(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const files: string[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...discoverLessonFiles(fullPath));
      continue;
    }
    if (LESSON_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

export function loadReviewerKnowledgeLessonDocumentFromText(text: string): ReviewerKnowledgeLessonDocument {
  const parsed = parseReviewerKnowledgeDocumentText(text);
  const wrapped = parseReviewerKnowledgeLessonInput(parsed);
  return Object.freeze({
    schema_version: wrapped.schema_version,
    lesson_version: wrapped.lesson_version,
    lesson: normalizeReviewerKnowledgeLesson(parseReviewerKnowledgeLesson(wrapped.lesson)),
  });
}

export function loadReviewerKnowledgeLessonFromFile(filePath: string): ReviewerKnowledgeLesson {
  const document = loadReviewerKnowledgeLessonDocumentFromText(readFileSync(filePath, "utf8"));
  return document.lesson;
}

export function loadReviewerKnowledgeLessonsFromDirectory(directoryPath: string): readonly ReviewerKnowledgeLesson[] {
  const lessons: ReviewerKnowledgeLesson[] = [];
  for (const filePath of discoverLessonFiles(directoryPath)) {
    lessons.push(loadReviewerKnowledgeLessonFromFile(filePath));
  }
  return Object.freeze(lessons);
}

export function loadReviewerKnowledgeLessonRegistryFromDirectory(directoryPath: string) {
  return createLessonRegistry(loadReviewerKnowledgeLessonsFromDirectory(directoryPath));
}
