import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { createGcamMapperCoverageReport } from "../coverage/gcamMapperCoverage.js";
import { renderGcamMapperCoverageReport } from "../renderer/gcamMapperRenderer.js";
import { createGcamMapperRegistry, createEmptyGcamMapperRegistry } from "../registry/gcamMapperRegistry.js";
import { validateGcamMapperCatalog } from "../validators/gcamMapperValidator.js";

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "gcamMapper");

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testRegistryLoads(): void {
  const registry = createGcamMapperRegistry(ROOT);
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.listArticleMappings().length >= 18, true);
  assert.equal(registry.listAtomMappings().length >= 18, true);
  assert.equal(registry.listRules().length >= 15, true);
  console.log("✓ GCAM mapper registry loads deterministically");
}

function testKnownMappings(): void {
  const registry = createGcamMapperRegistry(ROOT);
  const security = registry.map({
    concepts: ["terrorism", "security"],
    domains: ["security"],
    targets: ["state"],
    actions: ["incitement"],
    intents: ["promotion"],
    contexts: ["dialogue"],
    evidence: ["سنسقط النظام الليلة"],
    reviewerJudgment: "confirmed security incitement",
    confidence: 96,
  });
  assert.equal(security.status, "MAPPED");
  assert.equal(security.articleId, 14);
  assert.equal(security.atomId, "14-1");
  assert.equal(security.findingTitle, "Explicit security incitement");

  const religion = registry.map({
    concepts: ["religion", "mockery"],
    domains: ["religion"],
    targets: ["religious_group"],
    actions: ["mockery"],
    intents: ["attack"],
    contexts: ["dialogue"],
    evidence: ["هذا الدين سخيف"],
    reviewerJudgment: "religious mockery",
    confidence: 91,
  });
  assert.equal(religion.status, "MAPPED");
  assert.equal(religion.articleId, 8);
  assert.equal(religion.atomId, "8-1");

  const extremistRecruitment = registry.map({
    concepts: ["terrorism", "extremism", "recruitment", "banned_group"],
    domains: ["security", "politics"],
    targets: ["group"],
    actions: ["recruitment", "promotion"],
    intents: ["promotion"],
    contexts: ["dialogue"],
    evidence: ["انضموا للتنظيم المتطرف"],
    reviewerJudgment: "extremist recruitment",
    confidence: 94,
  });
  assert.equal(extremistRecruitment.status, "MAPPED");
  assert.equal(extremistRecruitment.articleId, 15);
  assert.equal(extremistRecruitment.atomId, "15-2");

  const militaryDisclosure = registry.map({
    concepts: ["military_disclosure", "confidential_information"],
    domains: ["security"],
    targets: ["military"],
    actions: ["disclosure", "leak"],
    intents: ["neutral"],
    contexts: ["news"],
    evidence: ["سربوا الأسرار العسكرية"],
    reviewerJudgment: "military disclosure",
    confidence: 92,
  });
  assert.equal(militaryDisclosure.status, "MAPPED");
  assert.equal(militaryDisclosure.articleId, 21);
  assert.equal(militaryDisclosure.atomId, "21-2");

  const unmapped = registry.map({
    concepts: ["weather_reference"],
    domains: ["travel"],
    targets: ["location"],
    actions: ["observation"],
    intents: ["neutral"],
    contexts: ["narration"],
    evidence: ["The weather is clear."],
    reviewerJudgment: "travel observation",
    confidence: 55,
  });
  assert.equal(unmapped.status, "UNMAPPED");
  assert.equal(unmapped.articleId, null);
  assert.equal(unmapped.mappingDebt.length > 0, true);
  console.log("✓ GCAM mapper resolves mapped and unmapped cases");
}

function testCoverageAndRendering(): void {
  const registry = createGcamMapperRegistry(ROOT);
  const coverageA = createGcamMapperCoverageReport(registry);
  const coverageB = createGcamMapperCoverageReport(registry);
  assert.equal(coverageA.hash, coverageB.hash);
  assert.equal(coverageA.status, "LOCKED");
  assert.equal(coverageA.productionReadiness, true);

  const rendered = renderGcamMapperCoverageReport(coverageA);
  assert.equal(rendered.includes("GCAM Mapping Layer"), true);
  assert.equal(rendered.includes("Status: LOCKED"), true);
  const renderedHashA = createHash("sha256").update(rendered, "utf8").digest("hex");
  const renderedHashB = createHash("sha256").update(rendered, "utf8").digest("hex");
  assert.equal(renderedHashA, renderedHashB);
  console.log("✓ GCAM mapper coverage and rendering are deterministic");
}

function testValidatorGuards(): void {
  const duplicateCatalog = {
    version: "1.0.0",
    articleMappings: [
      {
        id: "dup",
        version: "1.0.0",
        title: "A",
        description: "A",
        articleId: 1,
        articleNumber: "1",
        articleTitleAr: "A",
        findingTitle: "A",
        findingCategory: "A",
        concepts: ["a"],
        domains: ["a"],
        targets: ["a"],
        actions: ["a"],
        intents: ["a"],
        contexts: ["a"],
        relatedMappingIds: [],
        evidenceExamples: ["a"],
        reviewerExplanation: "a",
        mappingNotes: "a",
      },
      {
        id: "dup",
        version: "1.0.0",
        title: "B",
        description: "B",
        articleId: 2,
        articleNumber: "2",
        articleTitleAr: "B",
        findingTitle: "B",
        findingCategory: "B",
        concepts: ["b"],
        domains: ["b"],
        targets: ["b"],
        actions: ["b"],
        intents: ["b"],
        contexts: ["b"],
        relatedMappingIds: [],
        evidenceExamples: ["b"],
        reviewerExplanation: "b",
        mappingNotes: "b",
      },
    ],
    atomMappings: [],
    mappingRules: [],
  } as const;
  const duplicateValidation = validateGcamMapperCatalog(duplicateCatalog);
  assert.equal(duplicateValidation.valid, false);
  assert.equal(duplicateValidation.issues.some((issue) => issue.code === "duplicate.article.id"), true);

  const circularCatalog = {
    version: "1.0.0",
    articleMappings: [
      {
        id: "article.one",
        version: "1.0.0",
        title: "A",
        description: "A",
        articleId: 1,
        articleNumber: "1",
        articleTitleAr: "A",
        findingTitle: "A",
        findingCategory: "A",
        concepts: ["a"],
        domains: ["a"],
        targets: ["a"],
        actions: ["a"],
        intents: ["a"],
        contexts: ["a"],
        relatedMappingIds: ["article.two"],
        evidenceExamples: ["a"],
        reviewerExplanation: "a",
        mappingNotes: "a",
      },
      {
        id: "article.two",
        version: "1.0.0",
        title: "B",
        description: "B",
        articleId: 2,
        articleNumber: "2",
        articleTitleAr: "B",
        findingTitle: "B",
        findingCategory: "B",
        concepts: ["b"],
        domains: ["b"],
        targets: ["b"],
        actions: ["b"],
        intents: ["b"],
        contexts: ["b"],
        relatedMappingIds: ["article.one"],
        evidenceExamples: ["b"],
        reviewerExplanation: "b",
        mappingNotes: "b",
      },
    ],
    atomMappings: [],
    mappingRules: [
      {
        id: "rule.one",
        version: "1.0.0",
        title: "One",
        description: "One",
        priority: 1,
        match: { concepts: ["a"], domains: [], targets: [], actions: [], intents: [], contexts: [] },
        articleMappingId: "article.one",
        atomMappingId: null,
        relatedRuleIds: ["rule.two"],
        debtNote: "a",
      },
      {
        id: "rule.two",
        version: "1.0.0",
        title: "Two",
        description: "Two",
        priority: 1,
        match: { concepts: ["b"], domains: [], targets: [], actions: [], intents: [], contexts: [] },
        articleMappingId: "article.two",
        atomMappingId: null,
        relatedRuleIds: ["rule.one"],
        debtNote: "b",
      },
    ],
  } as const;
  const circularValidation = validateGcamMapperCatalog(circularCatalog);
  assert.equal(circularValidation.valid, false);
  assert.equal(circularValidation.issues.some((issue) => issue.code === "relationships.cycle"), true);
  console.log("✓ GCAM mapper validator catches duplicates and circular mappings");
}

function testEmptyRegistry(): void {
  const registry = createEmptyGcamMapperRegistry();
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.map({
    concepts: [],
    domains: [],
    targets: [],
    actions: [],
    intents: [],
    contexts: [],
    evidence: [],
    reviewerJudgment: "",
    confidence: 0,
  }).status, "UNMAPPED");
  console.log("✓ empty GCAM mapper registry remains deterministic");
}

function main(): void {
  testRegistryLoads();
  testKnownMappings();
  testCoverageAndRendering();
  testValidatorGuards();
  testEmptyRegistry();
  console.log("\nAll GCAM mapper tests passed.");
}

main();
