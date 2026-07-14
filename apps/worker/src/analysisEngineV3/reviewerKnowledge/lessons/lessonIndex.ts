import type { LessonIndex, LessonStatistics, ReviewerKnowledgeLesson } from "./lessonTypes.js";
import { buildLessonDependencyGraph } from "./lessonDependencyGraph.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "./lessonLoader.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function computeCoverage(lessons: readonly ReviewerKnowledgeLesson[]): number {
  if (lessons.length === 0) return 0;
  const covered = lessons.reduce((sum, lesson) => {
    const fields = [
      lesson.summary,
      ...lesson.learningObjectives,
      ...lesson.examples,
      ...lesson.counterExamples,
      ...lesson.exceptions,
      ...lesson.evidenceRules.minimum,
      ...lesson.evidenceRules.strong,
      ...lesson.evidenceRules.weak,
      ...lesson.evidenceRules.insufficient,
      ...lesson.evidenceRules.confidenceGuidance,
      ...lesson.gcamMappings.map((mapping) => mapping.reportTitle),
      ...lesson.reportTemplates.map((template) => template.findingTitle),
    ];
    const filled = fields.filter((value) => normalizeText(value).length > 0).length;
    return sum + (filled / fields.length) * 100;
  }, 0);
  return Number((covered / lessons.length).toFixed(3));
}

export function createLessonIndex(rootDir: string, lessons: readonly ReviewerKnowledgeLesson[] = loadReviewerKnowledgeLessonsFromDirectory(rootDir)): LessonIndex {
  const graph = buildLessonDependencyGraph(lessons);
  const reuseCount = lessons.reduce((sum, lesson) => sum + lesson.relatedLessons.length + lesson.prerequisites.length, 0);
  const warningCount = graph.orphanLessons.length;
  const errorCount = graph.missingReferences.length + graph.duplicateDependencies.length + graph.cycles.length;
  const statistics: LessonStatistics = Object.freeze({
    lessonCount: lessons.length,
    conceptCount: lessons.reduce((sum, lesson) => sum + lesson.concepts.length, 0),
    coverage: computeCoverage(lessons),
    missingReferences: graph.missingReferences.length,
    dependencyGraph: graph,
    validationScore: Math.max(0, 100 - errorCount * 10 - warningCount * 2),
    reuseCount,
    warningCount,
    errorCount,
  });

  const manifest = Object.freeze(lessons.map((lesson) => lesson.id).sort((left, right) => left.localeCompare(right)));
  const documents = Object.freeze(lessons.map((lesson) => Object.freeze({
    schema_version: 1,
    lesson_version: lesson.version,
    lesson,
  })));

  return Object.freeze({
    rootDir,
    lessons,
    documents,
    manifest,
    statistics,
  });
}

