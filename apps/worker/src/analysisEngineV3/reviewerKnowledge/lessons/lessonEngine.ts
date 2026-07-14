import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLessonRegistry } from "./lessonRegistry.js";
import { createLessonIndex } from "./lessonIndex.js";
import { composeReviewerKnowledgePack } from "./lessonComposer.js";
import { renderLessonCompositionSummary, renderReviewerKnowledgeLessons } from "./lessonRenderer.js";
import { searchLessons } from "./lessonSearch.js";
import type { LessonPackBlueprint, LessonSearchQuery, ReviewerKnowledgeLesson } from "./lessonTypes.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "./lessonLoader.js";

export class LessonEngine {
  constructor(private readonly rootDir: string, private readonly lessons: readonly ReviewerKnowledgeLesson[]) {}

  static fromDirectory(rootDir: string): LessonEngine {
    return new LessonEngine(rootDir, loadReviewerKnowledgeLessonsFromDirectory(rootDir));
  }

  get index() {
    return createLessonIndex(this.rootDir, this.lessons);
  }

  get registry() {
    return createLessonRegistry(this.lessons);
  }

  loadLesson(lessonId: string): ReviewerKnowledgeLesson | null {
    return this.registry.load(lessonId);
  }

  search(query: LessonSearchQuery) {
    return searchLessons(this.lessons, query);
  }

  composePack(blueprint: LessonPackBlueprint, lessonIds: readonly string[]): ReturnType<typeof composeReviewerKnowledgePack> {
    const selected = lessonIds.map((lessonId) => {
      const lesson = this.loadLesson(lessonId);
      if (!lesson) {
        throw new Error(`Lesson not found: ${lessonId}`);
      }
      return lesson;
    });
    return composeReviewerKnowledgePack(blueprint, selected);
  }

  renderLessons(lessonIds: readonly string[]): string {
    const selected = lessonIds.map((lessonId) => {
      const lesson = this.loadLesson(lessonId);
      if (!lesson) {
        throw new Error(`Lesson not found: ${lessonId}`);
      }
      return lesson;
    });
    return renderReviewerKnowledgeLessons(selected);
  }

  renderComposition(blueprint: LessonPackBlueprint, lessonIds: readonly string[]): string {
    const selected = lessonIds.map((lessonId) => {
      const lesson = this.loadLesson(lessonId);
      if (!lesson) {
        throw new Error(`Lesson not found: ${lessonId}`);
      }
      return lesson;
    });
    return renderLessonCompositionSummary(blueprint, selected);
  }
}

export function createLessonEngine(rootDir: string): LessonEngine {
  return LessonEngine.fromDirectory(rootDir);
}

export function createDefaultLessonEngine(): LessonEngine {
  return LessonEngine.fromDirectory(dirname(fileURLToPath(import.meta.url)));
}
