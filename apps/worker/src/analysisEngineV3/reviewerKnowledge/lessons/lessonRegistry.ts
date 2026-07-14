import type { ReviewerKnowledgeLesson } from "./lessonTypes.js";
import { compareLessonsByVersion, selectActiveLessonVersion } from "./lessonVersioning.js";
import { normalizeReviewerKnowledgeLesson } from "./lessonNormalizer.js";

export class LessonRegistry {
  private readonly lessons = new Map<string, Map<string, ReviewerKnowledgeLesson>>();

  constructor(entries: readonly ReviewerKnowledgeLesson[] = []) {
    this.registerAll(entries);
  }

  register(lesson: ReviewerKnowledgeLesson): this {
    const normalized = normalizeReviewerKnowledgeLesson(lesson);
    const id = normalized.id;
    const version = `${normalized.version.major}.${normalized.version.minor}.${normalized.version.patch}`;
    const bucket = this.lessons.get(id) ?? new Map<string, ReviewerKnowledgeLesson>();
    bucket.set(version, normalized);
    this.lessons.set(id, bucket);
    return this;
  }

  registerAll(lessons: readonly ReviewerKnowledgeLesson[]): this {
    for (const lesson of lessons) {
      this.register(lesson);
    }
    return this;
  }

  unregister(lessonId: string): boolean {
    return this.lessons.delete(lessonId.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase());
  }

  load(lessonId: string, version?: string): ReviewerKnowledgeLesson | null {
    const id = lessonId.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    const bucket = this.lessons.get(id);
    if (!bucket) return null;
    if (version) {
      return bucket.get(version.trim()) ?? null;
    }
    return selectActiveLessonVersion([...bucket.values()], id);
  }

  loadAll(lessonId: string): readonly ReviewerKnowledgeLesson[] {
    const id = lessonId.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    const bucket = this.lessons.get(id);
    if (!bucket) return Object.freeze([]);
    return Object.freeze([...bucket.values()].sort(compareLessonsByVersion));
  }

  list(): readonly ReviewerKnowledgeLesson[] {
    const all = [...this.lessons.values()].flatMap((bucket) => [...bucket.values()]);
    return Object.freeze(all.sort(compareLessonsByVersion));
  }
}

export function createLessonRegistry(entries?: readonly ReviewerKnowledgeLesson[]): LessonRegistry {
  return new LessonRegistry(entries);
}
