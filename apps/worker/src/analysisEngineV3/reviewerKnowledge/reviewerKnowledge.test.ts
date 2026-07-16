/**
 * Tests for the V3 reviewer knowledge pack engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/reviewerKnowledge.test.ts
 */
import { strict as assert } from "node:assert";
import { normalizeConceptConfidence } from "../concepts/conceptConfidence.js";
import type { Concept, ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { createDefaultReviewerKnowledgeRegistry, createReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";
import { createReviewerKnowledgeLoader } from "./reviewerKnowledgeLoader.js";
import { renderReviewerKnowledgePacksSection } from "./reviewerKnowledgeRenderer.js";
import { selectReviewerKnowledgePacks } from "./reviewerKnowledgeSelector.js";
import { PROFANITY_REVIEWER_KNOWLEDGE_PACK } from "./packs/profanityPack.js";
import { SECURITY_REVIEWER_KNOWLEDGE_PACK } from "./packs/securityPack.js";
import { validateReviewerKnowledgePack } from "./reviewerKnowledgeValidator.js";
import { runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { getDefaultReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRegistry.js";
import { renderReviewerMethodologySection } from "../reviewerMethodology/reviewerMethodologyRenderer.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeConceptContext(): ConceptContext {
  const concept: Concept = Object.freeze({
    id: "profanity",
    label: "Profanity",
    confidence: normalizeConceptConfidence({
      narrative: 0.82,
      semantic: 0.88,
      storyMemory: 0.1,
      entity: 0,
      glossary: 0.92,
      evidence: 0.97,
    }),
    evidenceSources: Object.freeze([]),
    originatingSentences: Object.freeze(["A: يا كلب"]),
    entityReferences: Object.freeze([]),
    glossaryReferences: Object.freeze(["شتيمة"]),
  });

  return Object.freeze({
    concepts: Object.freeze([concept]),
    conceptIds: Object.freeze(["profanity"]),
    primaryConceptId: "profanity",
    confidence: 0.96,
    conceptCount: 1,
  });
}

function makeSecurityConceptContext(): ConceptContext {
  const concepts: readonly Concept[] = Object.freeze([
    Object.freeze({
      id: "terrorism",
      label: "Terrorism",
      confidence: normalizeConceptConfidence({
        narrative: 0.79,
        semantic: 0.86,
        storyMemory: 0.12,
        entity: 0,
        glossary: 0.9,
        evidence: 0.95,
      }),
      evidenceSources: Object.freeze([]),
      originatingSentences: Object.freeze(["لازم نتمرد ونخرب الشوارع"]),
      entityReferences: Object.freeze([]),
      glossaryReferences: Object.freeze(["إرهاب"]),
    }),
    Object.freeze({
      id: "government",
      label: "Government",
      confidence: normalizeConceptConfidence({
        narrative: 0.73,
        semantic: 0.81,
        storyMemory: 0.08,
        entity: 0.72,
        glossary: 0.88,
        evidence: 0.94,
      }),
      evidenceSources: Object.freeze([]),
      originatingSentences: Object.freeze(["إسقاط النظام"]),
      entityReferences: Object.freeze([]),
      glossaryReferences: Object.freeze(["النظام"]),
    }),
  ]);

  return Object.freeze({
    concepts,
    conceptIds: Object.freeze(["government", "terrorism"]),
    primaryConceptId: "terrorism",
    confidence: 0.94,
    conceptCount: concepts.length,
  });
}

function makeSexualConceptContext(): ConceptContext {
  return Object.freeze({
    concepts: Object.freeze([]),
    conceptIds: Object.freeze(["sexual_reference"]),
    primaryConceptId: "sexual_reference",
    confidence: 0.9,
    conceptCount: 1,
  });
}

function makeSecurityAssessment(): ReviewerAssessment {
  return Object.freeze({
    methodologyId: "universal_reviewer_methodology_v1",
    methodologyTitle: "Universal Reviewer Methodology",
    narrativeUnderstanding: "The text contains an explicit call for unrest and overthrow.",
    speaker: "speaker",
    target: "state",
    victim: null,
    narrativeIntent: "incitement",
    evidenceStrength: 0.96,
    contextClassification: "literal",
    literalVsImpliedMeaning: "literal",
    exceptionSignals: Object.freeze([]),
    confidence: 0.95,
    applicableConceptIds: Object.freeze(["government", "terrorism"]),
    conceptConfidence: 0.94,
    conceptCount: 2,
    reasoningTrace: Object.freeze(["The utterance directly urges unrest and system harm."]),
    stageResults: Object.freeze([]),
  });
}

function testRegistryAndLoader(): void {
  const registry = createReviewerKnowledgeRegistry([PROFANITY_REVIEWER_KNOWLEDGE_PACK]);
  assert.equal(registry.list().length, 1);
  assert.equal(registry.load("v4_11_profanity")?.id, "v4_11_profanity");

  const loader = createReviewerKnowledgeLoader(registry);
  assert.equal(loader.loadRequired("v4_11_profanity").title, "Profanity Reviewer Knowledge Pack");
  assert.equal(createDefaultReviewerKnowledgeRegistry().load("v4_11_profanity")?.id, "v4_11_profanity");
  console.log("✓ registry and loader work deterministically");
}

function testDefaultRegistryIncludesSecurityPack(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  assert.equal(registry.load("v3_00_universal")?.id, "v3_00_universal");
  assert.equal(registry.load("v3_03_security")?.id, "v3_03_security");
  assert.equal(registry.load("v3_08_violence")?.id, "v3_08_violence");
  assert.equal(registry.load("v3_07_sexuality")?.id, "v3_07_sexuality");
  assert.equal(registry.load("v4_11_profanity")?.id, "v4_11_profanity");
  console.log("✓ default registry includes the universal, security, sexuality, violence, and profanity packs");
}

function testPackValidation(): void {
  const validation = validateReviewerKnowledgePack(PROFANITY_REVIEWER_KNOWLEDGE_PACK);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  console.log("✓ profanity pack validates");
}

function testSecurityPackValidation(): void {
  const validation = validateReviewerKnowledgePack(SECURITY_REVIEWER_KNOWLEDGE_PACK);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assertCondition(SECURITY_REVIEWER_KNOWLEDGE_PACK.article_mapping.some((entry) => entry.article_id === 14), "security pack should map to article 14");
  assertCondition(SECURITY_REVIEWER_KNOWLEDGE_PACK.protected_concepts.includes("national security"), "security pack should describe national security");
  console.log("✓ security pack validates");
}

function testSelectorFindsProfanityPack(): void {
  const assessment = runReviewerMethodology({
    promptInput: {
      reasoningContract: { title: "x", stages: [] },
      decisionGraph: { title: "x", nodes: [] },
      semanticLayer: { title: "x" },
      storyMemory: "",
      chunkContext: {
        localChunk: "A: يا كلب",
      },
      subjectModule: { id: "v4_11_profanity", titleAr: "الألفاظ النابية" },
      glossary: { title: "x", entries: [] },
      outputSchema: { title: "x", fields: [] },
    } as never,
    conceptContext: makeConceptContext(),
  });
  const packs = selectReviewerKnowledgePacks(assessment, makeConceptContext(), undefined, {
    id: "v4_11_profanity",
    titleAr: "الألفاظ النابية",
    scope: "Direct profanity analysis",
    articleIds: [11],
  });
  assert.equal(packs.length > 1, true);
  assert.equal(packs[0]?.id, "v3_00_universal");
  assert.equal(packs.some((pack) => pack.id === "v4_11_profanity"), true);
  console.log("✓ selector includes the universal pack and the profanity pack");
}

function testRendererIsDeterministic(): void {
  const conceptContext = makeConceptContext();
  const assessment = runReviewerMethodology({
    promptInput: {
      reasoningContract: { title: "x", stages: [] },
      decisionGraph: { title: "x", nodes: [] },
      semanticLayer: { title: "x" },
      storyMemory: "",
      chunkContext: {
        localChunk: "A: يا كلب",
      },
      subjectModule: { id: "v4_11_profanity", titleAr: "الألفاظ النابية" },
      glossary: { title: "x", entries: [] },
      outputSchema: { title: "x", fields: [] },
    } as never,
    conceptContext,
  });
  const packs = selectReviewerKnowledgePacks(assessment, conceptContext, undefined, {
    id: "v4_11_profanity",
    titleAr: "الألفاظ النابية",
    scope: "Direct profanity analysis",
    articleIds: [11],
  });
  const renderedA = renderReviewerKnowledgePacksSection(packs);
  const renderedB = renderReviewerKnowledgePacksSection(packs);

  assert.equal(renderedA, renderedB);
  assert.equal(packs[0]?.id, "v3_00_universal");
  assertCondition(renderedA.includes("Profanity Reviewer Knowledge Pack"), "rendered section should contain the pack title");
  assertCondition(renderedA.includes("Universal Reviewer Knowledge Pack"), "rendered section should contain the universal pack title");
  assertCondition(renderedA.includes("required_evidence"), "rendered section should contain the pack schema");
  console.log("✓ renderer is deterministic");
}

function testSelectorFindsSecurityPack(): void {
  const conceptContext = makeSecurityConceptContext();
  const assessment = makeSecurityAssessment();
  const packs = selectReviewerKnowledgePacks(assessment, conceptContext, undefined, {
    id: "v3_03_security",
    titleAr: "الأمن الوطني",
    scope: "National security analysis",
    articleIds: [14],
  });
  assert.equal(packs.length > 1, true);
  assert.equal(packs[0]?.id, "v3_00_universal");
  assert.equal(packs.some((pack) => pack.id === "v3_03_security"), true);
  console.log("✓ selector includes the universal pack and the security pack");
}

function testSelectorFindsSexualPack(): void {
  const conceptContext = makeSexualConceptContext();
  const assessment = Object.freeze({
    methodologyId: "universal_reviewer_methodology_v1",
    methodologyTitle: "Universal Reviewer Methodology",
    narrativeUnderstanding: "The text contains a sexual reference.",
    speaker: "speaker",
    target: "listener",
    victim: null,
    narrativeIntent: "reference",
    evidenceStrength: 0.86,
    contextClassification: "dialogue",
    literalVsImpliedMeaning: "literal",
    exceptionSignals: Object.freeze([]),
    confidence: 0.88,
    applicableConceptIds: Object.freeze(["sexual_reference"]),
    conceptConfidence: 0.88,
    conceptCount: 1,
    reasoningTrace: Object.freeze(["The literal line contains an explicit sexual reference."]),
    stageResults: Object.freeze([]),
  }) as ReviewerAssessment;

  const packs = selectReviewerKnowledgePacks(assessment, conceptContext, undefined, {
    id: "v3_07_sexuality",
    titleAr: "المحتوى الجنسي",
    scope: "Sexual content analysis",
    articleIds: [10],
  });
  assert.equal(packs.length > 1, true);
  assert.equal(packs[0]?.id, "v3_00_universal");
  assert.equal(packs.some((pack) => pack.id === "v3_07_sexuality"), true);
  console.log("✓ selector includes the universal pack and the sexuality pack");
}

function testSecurityRendererIsDeterministic(): void {
  const packs = [SECURITY_REVIEWER_KNOWLEDGE_PACK];
  const renderedA = renderReviewerKnowledgePacksSection(packs);
  const renderedB = renderReviewerKnowledgePacksSection(packs);

  assert.equal(renderedA, renderedB);
  assertCondition(renderedA.includes("National Security Reviewer Knowledge Pack"), "rendered section should contain the security pack title");
  assertCondition(renderedA.includes("article_mapping"), "rendered section should contain article mapping");
  assertCondition(renderedA.includes("14-1"), "rendered section should include security atoms");
  console.log("✓ security renderer is deterministic");
}

function testMethodologyRenderer(): void {
  const methodology = getDefaultReviewerMethodology();
  const assessment = runReviewerMethodology({
    promptInput: {
      reasoningContract: { title: "x", stages: [] },
      decisionGraph: { title: "x", nodes: [] },
      semanticLayer: { title: "x" },
      storyMemory: "",
      chunkContext: {
        localChunk: "A: يا كلب",
      },
      subjectModule: { id: "v4_11_profanity", titleAr: "الألفاظ النابية" },
      glossary: { title: "x", entries: [] },
      outputSchema: { title: "x", fields: [] },
    } as never,
    conceptContext: makeConceptContext(),
  });
  const rendered = renderReviewerMethodologySection(methodology, assessment);

  assertCondition(rendered.includes("Reviewer Methodology"), "methodology section should render");
  assertCondition(rendered.includes("Narrative Understanding"), "methodology stage catalog should render");
  console.log("✓ methodology renderer is deterministic");
}

async function main(): Promise<void> {
  testRegistryAndLoader();
  testDefaultRegistryIncludesSecurityPack();
  testPackValidation();
  testSecurityPackValidation();
  testMethodologyRenderer();
  testSelectorFindsProfanityPack();
  testSelectorFindsSecurityPack();
  testSelectorFindsSexualPack();
  testRendererIsDeterministic();
  testSecurityRendererIsDeterministic();
  console.log("\nAll V3 reviewer knowledge tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
