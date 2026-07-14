/**
 * Deterministic tests for the V3 lesson engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/lessons/lessonEngine.test.ts
 */
import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLessonEngine } from "./lessonEngine.js";
import { createLessonRegistry } from "./lessonRegistry.js";
import { buildLessonDependencyGraph } from "./lessonDependencyGraph.js";
import { composeReviewerKnowledgePack } from "./lessonComposer.js";
import { renderReviewerKnowledgeLessons, renderLessonCompositionSummary } from "./lessonRenderer.js";
import { searchLessons } from "./lessonSearch.js";
import { validateReviewerKnowledgeLesson } from "./lessonValidator.js";

function fixtureRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "examples");
}

function makeLesson(id: string, versionPatch: number, prerequisites: readonly string[] = [], relatedLessons: readonly string[] = []) {
  return Object.freeze({
    id,
    title: `${id} lesson`,
    version: Object.freeze({ major: 1, minor: 0, patch: versionPatch }),
    language: "en",
    summary: `${id} summary`,
    learningObjectives: Object.freeze([`${id} objective`]),
    concepts: Object.freeze([Object.freeze({
      id,
      title: `${id} concept`,
      summary: `${id} concept summary`,
      tags: Object.freeze([id, "academy"]),
      target: id,
      articleIds: Object.freeze([12]),
    })]),
    reviewerQuestions: Object.freeze([Object.freeze({
      id: `${id}-q1`,
      purpose: "Check understanding",
      expectedAnswerFormat: "short answer",
      reasoningGuidance: "Anchor to the local lesson text.",
      evidenceRequirements: Object.freeze([`${id} evidence`]),
    })]),
    examples: Object.freeze([`${id} example`]),
    counterExamples: Object.freeze([`${id} counterexample`]),
    exceptions: Object.freeze([`${id} exception`]),
    evidenceRules: Object.freeze({
      minimum: Object.freeze([`${id} minimum`]),
      strong: Object.freeze([`${id} strong`]),
      weak: Object.freeze([`${id} weak`]),
      insufficient: Object.freeze([`${id} insufficient`]),
      confidenceGuidance: Object.freeze([`${id} guidance`]),
    }),
    conceptRelationships: Object.freeze([]),
    glossaryReferences: Object.freeze([Object.freeze({
      term: id,
      conceptId: id,
      relation: "anchor",
      note: null,
    })]),
    gcamMappings: Object.freeze([Object.freeze({
      articleId: 12,
      articleTitle: "Public order",
      articleNumber: "12",
      atomNumber: "12-1",
      reportTitle: `${id} report`,
      note: null,
    })]),
    reportTemplates: Object.freeze([Object.freeze({
      findingTitle: `${id} finding`,
      reasonTemplate: `${id} reason`,
      recommendationTemplate: `${id} recommendation`,
      severity: "medium",
      priority: 50,
      reportCategory: "academy",
    })]),
    benchmarkReferences: Object.freeze([`${id}-benchmark`]),
    prerequisites,
    relatedLessons,
    metadata: Object.freeze({ subject: "academy", category: "demo", tags: ["academy", id], source: "test" }),
  });
}

function testLoadingAndVersioning(): void {
  const engine = createLessonEngine(fixtureRoot());
  assert.equal(engine.index.statistics.lessonCount, 3);
  assert.equal(engine.loadLesson("universal_intro")?.version.patch, 1);
  assert.equal(engine.registry.loadAll("universal_intro").length, 2);
  assert.equal(engine.registry.load("security_basics")?.id, "security_basics");
  console.log("✓ lesson loading and versioning are deterministic");
}

function testAcademyLesson001(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_001_what_is_a_finding");
  assert(lesson);
  assert.equal(lesson?.title, "What Is A Finding?");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_001_what_is_a_finding" })[0]?.lesson.id, "lesson_001_what_is_a_finding");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 001 is discoverable, loadable, and valid");
}

function testAcademyLesson002(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_002_what_is_evidence");
  assert(lesson);
  assert.equal(lesson?.title, "What Is Evidence?");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_002_what_is_evidence" })[0]?.lesson.id, "lesson_002_what_is_evidence");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 002 is discoverable, loadable, and valid");
}

function testAcademyLesson003(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_003_understanding_context");
  assert(lesson);
  assert.equal(lesson?.title, "Understanding Context");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_003_understanding_context" })[0]?.lesson.id, "lesson_003_understanding_context");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 003 is discoverable, loadable, and valid");
}

function testAcademyLesson004(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_004_speaker_identification");
  assert(lesson);
  assert.equal(lesson?.title, "Speaker Identification");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_004_speaker_identification" })[0]?.lesson.id, "lesson_004_speaker_identification");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 004 is discoverable, loadable, and valid");
}

function testAcademyLesson005(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_005_target_identification");
  assert(lesson);
  assert.equal(lesson?.title, "Target Identification");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_005_target_identification" })[0]?.lesson.id, "lesson_005_target_identification");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 005 is discoverable, loadable, and valid");
}

function testAcademyLesson006(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_006_intent_recognition");
  assert(lesson);
  assert.equal(lesson?.title, "Intent Recognition");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_006_intent_recognition" })[0]?.lesson.id, "lesson_006_intent_recognition");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 006 is discoverable, loadable, and valid");
}

function testAcademyLesson007(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_007_confidence_assessment");
  assert(lesson);
  assert.equal(lesson?.title, "Confidence Assessment");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_007_confidence_assessment" })[0]?.lesson.id, "lesson_007_confidence_assessment");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 007 is discoverable, loadable, and valid");
}

function testAcademyLesson008(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_008_narrative_structure");
  assert(lesson);
  assert.equal(lesson?.title, "Narrative Structure Recognition");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_008_narrative_structure" })[0]?.lesson.id, "lesson_008_narrative_structure");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 008 is discoverable, loadable, and valid");
}

function testAcademyLesson009(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_009_concept_relationships");
  assert(lesson);
  assert.equal(lesson?.title, "Concept Relationship Reasoning");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_009_concept_relationships" })[0]?.lesson.id, "lesson_009_concept_relationships");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 009 is discoverable, loadable, and valid");
}

function testAcademyLesson010(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_010_exception_recognition");
  assert(lesson);
  assert.equal(lesson?.title, "Exception Recognition");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_010_exception_recognition" })[0]?.lesson.id, "lesson_010_exception_recognition");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 010 is discoverable, loadable, and valid");
}

function testAcademyLesson011(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_011_multiple_findings");
  assert(lesson);
  assert.equal(lesson?.title, "Multiple Findings in One Scene");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_011_multiple_findings" })[0]?.lesson.id, "lesson_011_multiple_findings");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 011 is discoverable, loadable, and valid");
}

function testAcademyLesson012(): void {
  const engine = createLessonEngine(dirname(fileURLToPath(import.meta.url)));
  const lesson = engine.loadLesson("lesson_012_evidence_prioritization");
  assert(lesson);
  assert.equal(lesson?.title, "Evidence Prioritization");
  assert.equal(lesson?.version.major, 1);
  assert.equal(lesson?.version.minor, 0);
  assert.equal(lesson?.version.patch, 0);
  assert.equal(engine.search({ lessonId: "lesson_012_evidence_prioritization" })[0]?.lesson.id, "lesson_012_evidence_prioritization");
  assert.equal(validateReviewerKnowledgeLesson(lesson!).valid, true);
  console.log("✓ academy lesson 012 is discoverable, loadable, and valid");
}

function testRenderingAndComposition(): void {
  const engine = createLessonEngine(fixtureRoot());
  const lessons = engine.registry.list();
  const renderedA = renderReviewerKnowledgeLessons(lessons);
  const renderedB = renderReviewerKnowledgeLessons(lessons);
  assert.equal(renderedA, renderedB);

  const pack = engine.composePack({
    id: "v3_99_demo",
    module_id: "v3_99_demo",
    title: "Demo Academy Pack",
    trigger_concept_ids: ["universal_intro", "security_basics"],
    purpose: "Demo composed pack",
    protected_interests: ["academy"],
    protected_concepts: ["dialogue"],
  }, ["universal_intro", "security_basics"]);
  const composedA = renderLessonCompositionSummary({
    id: "v3_99_demo",
    module_id: "v3_99_demo",
    title: "Demo Academy Pack",
    trigger_concept_ids: ["universal_intro", "security_basics"],
    purpose: "Demo composed pack",
    protected_interests: ["academy"],
    protected_concepts: ["dialogue"],
  }, lessons);
  const composedB = renderLessonCompositionSummary({
    id: "v3_99_demo",
    module_id: "v3_99_demo",
    title: "Demo Academy Pack",
    trigger_concept_ids: ["universal_intro", "security_basics"],
    purpose: "Demo composed pack",
    protected_interests: ["academy"],
    protected_concepts: ["dialogue"],
  }, lessons);
  assert.equal(composedA, composedB);
  assert.equal(pack.id, "v3_99_demo");
  assert.equal(pack.trigger_concept_ids.includes("security_basics"), true);
  console.log("✓ lesson rendering and composition are deterministic");
}

function testSearchAndGraph(): void {
  const lessonA = makeLesson("alpha", 0, ["beta"], []);
  const lessonB = makeLesson("beta", 0, ["alpha"], []);
  const lessonC = makeLesson("gamma", 0, [], []);
  const registry = createLessonRegistry([lessonA, lessonB, lessonC]);
  const searchResults = searchLessons(registry.list(), { keyword: "alpha" });
  assert.equal(searchResults[0]?.lesson.id, "alpha");
  const graph = buildLessonDependencyGraph([lessonA, lessonB, lessonC]);
  assert.equal(graph.cycles.length > 0, true);
  console.log("✓ lesson search and dependency graph are deterministic");
}

function testValidation(): void {
  const lesson = makeLesson("delta", 0);
  const validation = validateReviewerKnowledgeLesson(lesson);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  console.log("✓ lesson validation passes for valid content");
}

function testDeterministicHashes(): void {
  const lesson = makeLesson("epsilon", 0);
  const validationA = validateReviewerKnowledgeLesson(lesson);
  const validationB = validateReviewerKnowledgeLesson(lesson);
  assert.equal(JSON.stringify(validationA), JSON.stringify(validationB));
  console.log("✓ lesson validation output is stable");
}

async function main(): Promise<void> {
  testLoadingAndVersioning();
  testAcademyLesson001();
  testAcademyLesson002();
  testAcademyLesson003();
  testAcademyLesson004();
  testAcademyLesson005();
  testAcademyLesson006();
  testAcademyLesson007();
  testAcademyLesson008();
  testAcademyLesson009();
  testAcademyLesson010();
  testAcademyLesson011();
  testAcademyLesson012();
  testRenderingAndComposition();
  testSearchAndGraph();
  testValidation();
  testDeterministicHashes();
  console.log("\nAll V3 lesson engine tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
