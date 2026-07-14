/**
 * Deterministic tests for the V3 knowledge linter.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/linter/knowledgeLinter.test.ts
 */
import { strict as assert } from "node:assert";
import { DEFAULT_REVIEWER_QUESTION_SET } from "../../reviewerQuestions/reviewerQuestionDefaults.js";
import type { KnowledgeLintPack } from "./knowledgeLintTypes.js";
import { createKnowledgeLintRegistry } from "./knowledgeLintRegistry.js";
import { hashKnowledgeLintValue, serializeKnowledgeLintReport } from "./knowledgeLintReport.js";
import { lintKnowledgePack } from "./knowledgeLinter.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeQuestions() {
  return DEFAULT_REVIEWER_QUESTION_SET.questions.map((question) => Object.freeze({
    id: question.id,
    category: question.category,
    purpose: question.purpose,
    expectedAnswerFormat: question.expectedAnswerFormat,
    reasoningGuidance: question.reasoningGuidance,
    evidenceRequirements: Object.freeze([...question.evidenceRequirements]),
  }));
}

function makeConcept(id: string, name: string, articleId: number): KnowledgeLintPack["concepts"][number] {
  return Object.freeze({
    id,
    name,
    definition: `${name} definition`,
    examples: Object.freeze([`${name} positive example`]),
    counterExamples: Object.freeze([`${name} negative example`]),
    borderlineExamples: Object.freeze([`${name} borderline example`]),
    educationalExamples: Object.freeze([`${name} educational example`]),
    fictionExamples: Object.freeze([`${name} fiction example`]),
    reviewerQuestions: Object.freeze(makeQuestions()),
    evidence: Object.freeze({
      minimum: Object.freeze([`${name} minimum evidence`]),
      strong: Object.freeze([`${name} strong evidence`]),
      weak: Object.freeze([`${name} weak evidence`]),
      insufficient: Object.freeze([`${name} insufficient evidence`]),
    }),
    exceptions: Object.freeze(["Educational", "Historical"]),
    falsePositives: Object.freeze([`${name} false positive`]),
    falseNegatives: Object.freeze([`${name} false negative`]),
    reportTemplate: Object.freeze({
      findingTitle: `${name} finding`,
      reasonTemplate: `${name} reason template`,
      recommendationTemplate: `${name} recommendation template`,
      severity: "medium",
      priority: 50,
      reportCategory: "security",
    }),
    confidenceRules: Object.freeze([
      Object.freeze({ threshold: 0, label: "minimum" }),
      Object.freeze({ threshold: 25, label: "weak" }),
      Object.freeze({ threshold: 50, label: "moderate" }),
      Object.freeze({ threshold: 75, label: "strong" }),
      Object.freeze({ threshold: 100, label: "certain" }),
    ]),
    glossaryIds: Object.freeze([`${id}-glossary`]),
    articleMappings: Object.freeze([
      Object.freeze({
        articleId,
        articleTitle: `Article ${articleId}`,
        articleNumber: String(articleId),
        atomNumber: `${articleId}-1`,
        reportTitle: `${name} report`,
        note: null,
      }),
    ]),
    parentConceptId: null,
    childConceptIds: Object.freeze([]),
    notes: Object.freeze([]),
  });
}

function makeValidPack(): KnowledgeLintPack {
  return Object.freeze({
    metadata: Object.freeze({
      id: "lint_pack_valid",
      version: "1.0.0",
      title: "Lint Pack Valid",
      category: "security",
      language: "ar",
      description: "A deterministic valid lint fixture.",
    }),
    concepts: Object.freeze([
      makeConcept("concept_a", "Concept A", 12),
      Object.freeze({
        ...makeConcept("concept_b", "Concept B", 13),
        parentConceptId: "concept_a",
      }),
    ]),
    glossary: Object.freeze([
      Object.freeze({ id: "concept_a-glossary", term: "Term A", definition: "Definition A", aliases: Object.freeze(["A"]), conceptIds: Object.freeze(["concept_a"]), notes: Object.freeze([]) }),
      Object.freeze({ id: "concept_b-glossary", term: "Term B", definition: "Definition B", aliases: Object.freeze(["B"]), conceptIds: Object.freeze(["concept_b"]), notes: Object.freeze([]) }),
    ]),
    relationships: Object.freeze([
      Object.freeze({ parentConceptId: "concept_a", childConceptId: "concept_b", type: "parent_child", note: null }),
    ]),
    sourcePath: "/tmp/lint_pack_valid/pack.v1.json",
    notes: Object.freeze([]),
  });
}

function makeInvalidPack(overrides: Partial<KnowledgeLintPack>): KnowledgeLintPack {
  const base = makeValidPack();
  return Object.freeze({
    ...base,
    ...overrides,
    metadata: Object.freeze({ ...base.metadata, ...(overrides.metadata ?? {}) }),
    concepts: Object.freeze(overrides.concepts ?? base.concepts),
    glossary: Object.freeze(overrides.glossary ?? base.glossary),
    relationships: Object.freeze(overrides.relationships ?? base.relationships),
  });
}

function testValidPack(): void {
  const report = lintKnowledgePack(makeValidPack());
  assert.equal(report.errors.length, 0);
  assert.equal(report.overallScore.readyForAcademy, true);
  assertCondition(report.stableHash.length === 64, "stable hash should be sha256");
  console.log("✓ valid pack passes linting");
}

function testDuplicateConcept(): void {
  const pack = makeInvalidPack({
    concepts: Object.freeze([makeValidPack().concepts[0], makeValidPack().concepts[0]]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "concept.id.duplicate"), "duplicate concept should be reported");
  console.log("✓ duplicate concept is rejected");
}

function testMissingEvidence(): void {
  const pack = makeInvalidPack({
    concepts: Object.freeze([Object.freeze({
      ...makeValidPack().concepts[0],
      evidence: Object.freeze({ minimum: Object.freeze([]), strong: Object.freeze([]), weak: Object.freeze([]), insufficient: Object.freeze([]) }),
    }), ...makeValidPack().concepts.slice(1)]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "evidence.minimum.missing"), "missing evidence should be reported");
  console.log("✓ missing evidence is rejected");
}

function testMissingReportTemplate(): void {
  const pack = makeInvalidPack({
    concepts: Object.freeze([Object.freeze({
      ...makeValidPack().concepts[0],
      reportTemplate: Object.freeze({
        ...makeValidPack().concepts[0].reportTemplate,
        findingTitle: "",
      }),
    }), ...makeValidPack().concepts.slice(1)]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "report.findingTitle.missing"), "missing report template should be reported");
  console.log("✓ missing report template is rejected");
}

function testMissingGlossary(): void {
  const pack = makeInvalidPack({
    glossary: Object.freeze([]),
  });
  const report = lintKnowledgePack(pack);
  assert.equal(report.errors.length, 0);
  assertCondition(report.warnings.length > 0, "missing glossary should emit warnings");
  console.log("✓ missing glossary emits warnings");
}

function testBrokenRelationship(): void {
  const pack = makeInvalidPack({
    relationships: Object.freeze([{ parentConceptId: "concept_x", childConceptId: "concept_y", type: "parent_child", note: null }]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "relationships.parent.missing"), "broken relationship should be reported");
  console.log("✓ broken relationship is rejected");
}

function testBrokenGcamMapping(): void {
  const pack = makeInvalidPack({
    concepts: Object.freeze([Object.freeze({
      ...makeValidPack().concepts[0],
      articleMappings: Object.freeze([Object.freeze({
        articleId: 12,
        articleTitle: "",
        articleNumber: "",
        atomNumber: null,
        reportTitle: "",
        note: null,
      })]),
    }), ...makeValidPack().concepts.slice(1)]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "gcam.articleTitle.missing"), "broken GCAM mapping should be reported");
  console.log("✓ broken GCAM mapping is rejected");
}

function testDuplicateGlossary(): void {
  const pack = makeInvalidPack({
    glossary: Object.freeze([
      Object.freeze({ id: "dup", term: "Term A", definition: "Definition A", aliases: Object.freeze(["A"]), conceptIds: Object.freeze(["concept_a"]), notes: Object.freeze([]) }),
      Object.freeze({ id: "dup", term: "Term B", definition: "Definition B", aliases: Object.freeze(["B"]), conceptIds: Object.freeze(["concept_b"]), notes: Object.freeze([]) }),
    ]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "glossary.id.duplicate"), "duplicate glossary should be reported");
  console.log("✓ duplicate glossary is rejected");
}

function testInvalidConfidence(): void {
  const pack = makeInvalidPack({
    concepts: Object.freeze([Object.freeze({
      ...makeValidPack().concepts[0],
      confidenceRules: Object.freeze([
        Object.freeze({ threshold: 50, label: "moderate" }),
        Object.freeze({ threshold: 50, label: "duplicate" }),
        Object.freeze({ threshold: 120, label: "invalid" }),
      ]),
    }), ...makeValidPack().concepts.slice(1)]),
  });
  const report = lintKnowledgePack(pack);
  assertCondition(report.errors.some((issue) => issue.code === "confidence.range.invalid"), "invalid confidence should be reported");
  console.log("✓ invalid confidence is rejected");
}

function testSerializationStability(): void {
  const reportA = lintKnowledgePack(makeValidPack());
  const reportB = lintKnowledgePack(makeValidPack());
  assert.equal(serializeKnowledgeLintReport(reportA), serializeKnowledgeLintReport(reportB));
  console.log("✓ serialization is stable");
}

function testHashStability(): void {
  const reportA = lintKnowledgePack(makeValidPack());
  const reportB = lintKnowledgePack(makeValidPack());
  assert.equal(reportA.stableHash, reportB.stableHash);
  assert.equal(hashKnowledgeLintValue(reportA), hashKnowledgeLintValue(reportB));
  console.log("✓ hash is stable");
}

function testRegistryRejectsInvalidPacks(): void {
  const registry = createKnowledgeLintRegistry();
  let rejected = false;
  try {
    registry.register(makeInvalidPack({
      concepts: Object.freeze([makeValidPack().concepts[0], makeValidPack().concepts[0]]),
    }));
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);
  console.log("✓ academy loader can later reject invalid packs using the linter");
}

async function main(): Promise<void> {
  testValidPack();
  testDuplicateConcept();
  testMissingEvidence();
  testMissingReportTemplate();
  testMissingGlossary();
  testBrokenRelationship();
  testBrokenGcamMapping();
  testDuplicateGlossary();
  testInvalidConfidence();
  testSerializationStability();
  testHashStability();
  testRegistryRejectsInvalidPacks();
  console.log("\nAll V3 knowledge linter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
