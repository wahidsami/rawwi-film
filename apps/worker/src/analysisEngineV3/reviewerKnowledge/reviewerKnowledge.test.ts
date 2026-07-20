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
import { createEmergencyContextualReviewerKnowledgeSelection } from "./emergencyContextualReviewerRouter.js";
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

function makeEmptyConceptContext(): ConceptContext {
  return Object.freeze({
    concepts: Object.freeze([]),
    conceptIds: Object.freeze([]),
    primaryConceptId: null,
    confidence: 0,
    conceptCount: 0,
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

function makeProfanityPromptInput(): never {
  return {
    reasoningContract: { title: "x", stages: [] },
    decisionGraph: { title: "x", nodes: [] },
    semanticLayer: { title: "x" },
    storyMemory: "",
    chunkContext: {
      localChunk: "A: يا كلب",
      neighboringSentences: [],
      sceneMemory: "",
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis",
      articleIds: [11],
      rules: ["Identify literal profanity in the chunk."],
      exclusions: ["Do not classify neutral quotations."],
      requiredEvidence: ["Literal profanity present in the chunk."],
      decisionTree: ["Is there literal profanity?", "Does context negate the literal reading?"],
      examples: ["A direct profanity in dialogue."],
      nonExamples: ["Educational mention of a profanity term."],
      notes: ["Deterministic router test input."],
    },
    glossary: { title: "x", entries: [] },
    outputSchema: { title: "x", fields: [] },
  } as never;
}

function makeNeutralPromptInput(chunkText: string): never {
  const base = makeProfanityPromptInput() as unknown as Record<string, unknown>;
  return {
    ...base,
    chunkContext: {
      localChunk: chunkText,
      neighboringSentences: [],
      sceneMemory: "",
    },
    subjectModule: {
      id: "v3_00_universal",
      titleAr: "الإرشاد العام",
      scope: "Universal context analysis",
      articleIds: [],
    },
  } as never;
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

function testEmergencyRouterIsDeterministicAndSelective(): void {
  const promptInput = makeProfanityPromptInput();
  const conceptContext = makeConceptContext();
  const assessment = runReviewerMethodology({
    promptInput,
    conceptContext,
  });

  const selectionA = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput,
    conceptContext,
    assessment,
  });
  const selectionB = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput,
    conceptContext,
    assessment,
  });

  assert.deepEqual(selectionA.routing.selectedReviewerIds, selectionB.routing.selectedReviewerIds);
  assert.deepEqual(selectionA.routing.selectedReviewerPackIds, selectionB.routing.selectedReviewerPackIds);
  assert.equal(selectionA.routing.selectedReviewerIds.includes("v4_11_profanity"), true);
  assert.equal(selectionA.routing.rejectedReviewerIds.includes("v3_01_religion"), true);
  assert.equal(selectionA.routing.rejectedReviewerIds.includes("v3_04_history"), true);
  assert.equal(selectionA.routing.rejectedReviewerIds.includes("v3_04_politics"), true);
  assert.equal(selectionA.routing.rejectedReviewerIds.includes("v3_13_travel"), true);
  assert.equal(selectionA.routing.rejectedReviewerIds.includes("v3_06_leadership"), false);
  assert.equal(selectionA.routing.knowledgeReductionPercent > 0, true);
  assert.equal(selectionA.reviewerKnowledgeRegistry.list().length < createDefaultReviewerKnowledgeRegistry().list().length, true);
  console.log("✓ emergency router is deterministic and selective");
}

function testEmergencyRouterDetectsExactProfanityPhrase(): void {
  const promptInputBase = makeProfanityPromptInput() as unknown as Record<string, unknown>;
  const promptInput = {
    ...promptInputBase,
    chunkContext: {
      localChunk: "حاضر. فهد يتمتم: كس امة",
      neighboringSentences: [],
      sceneMemory: "",
    },
  } as never;
  const conceptContext = Object.freeze({
    ...makeConceptContext(),
    concepts: Object.freeze([
      Object.freeze({
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
        originatingSentences: Object.freeze(["فهد يتمتم: كس امة"]),
        entityReferences: Object.freeze([]),
        glossaryReferences: Object.freeze(["كس امة"]),
      }),
    ]),
    conceptIds: Object.freeze(["profanity"]),
    primaryConceptId: "profanity",
  });
  const assessment = runReviewerMethodology({
    promptInput,
    conceptContext,
  });

  const selection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput,
    conceptContext,
    assessment,
  });

  assert.equal(selection.routing.selectedReviewerIds.includes("v4_11_profanity"), true);
  assert.equal(selection.routing.selectedReviewerIds.includes("v3_01_religion"), false);
  assert.equal(selection.routing.selectedReviewerIds.includes("v3_03_security"), false);
  assert.equal(selection.routing.detectedConceptIds?.includes("profanity"), true);
  assert.equal(selection.routing.knowledgeDomains?.includes("profanity"), true);
  console.log("✓ emergency router detects the exact profanity phrase");
}

function testEmergencyRouterIgnoresStoryMemory(): void {
  const promptInput = makeProfanityPromptInput() as unknown as Record<string, unknown>;
  const pollutedPromptInput = {
    ...promptInput,
    storyMemory: {
      summary: "Earlier scene discussed religion and sacred symbols.",
      notes: ["religion", "sacred symbols"],
      scenes: ["A previous religious discussion."],
    },
  };
  const conceptContext = makeConceptContext();
  const assessment = runReviewerMethodology({
    promptInput: pollutedPromptInput as never,
    conceptContext,
  });

  const selection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput: pollutedPromptInput as never,
    conceptContext,
    assessment,
  });

  assert.equal(selection.routing.selectedReviewerIds.includes("v3_01_religion"), false);
  assert.equal(selection.routing.selectedReviewerIds.includes("v4_11_profanity"), true);
  console.log("✓ emergency router ignores story memory");
}

function testEmergencyRouterUsesUniversalOnlyWhenNoConceptsDetected(): void {
  const promptInput = makeNeutralPromptInput("A: مرحبا، كيف الحال؟");
  const conceptContext = makeEmptyConceptContext();
  const assessment = runReviewerMethodology({
    promptInput,
    conceptContext,
  });

  const selection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput,
    conceptContext,
    assessment,
  });

  assert.deepEqual(selection.routing.selectedReviewerIds, ["v3_00_universal"]);
  assert.equal(selection.routing.selectedReviewerIds.includes("v3_01_religion"), false);
  assert.equal(selection.routing.selectedReviewerIds.includes("v3_03_security"), false);
  assert.equal(selection.routing.selectedReviewerIds.includes("v4_11_profanity"), false);
  console.log("✓ emergency router stays universal-only when no concepts are detected");
}

function testEmergencyRouterInfersHostileDialogueConcepts(): void {
  const promptInput = makeNeutralPromptInput("يا... موتوا وخلصوني منكم");
  const conceptContext = makeEmptyConceptContext();
  const assessment = runReviewerMethodology({
    promptInput,
    conceptContext,
  });

  const selection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput,
    conceptContext,
    assessment,
  });

  assert.equal(selection.routing.detectedConceptIds?.includes("profanity"), true);
  assert.equal(selection.routing.detectedConceptIds?.includes("insult"), true);
  assert.equal(selection.routing.detectedConceptIds?.includes("hostility"), true);
  assert.equal(selection.routing.knowledgeDomains?.includes("profanity"), true);
  assert.equal(selection.routing.selectedReviewerIds.includes("v4_11_profanity"), true);
  assert.equal(selection.routing.selectedReviewerIds.includes("v3_01_religion"), false);
  assert.equal(selection.routing.selectedReviewerIds.includes("v3_03_security"), false);
  console.log("✓ emergency router infers hostile dialogue concepts");
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
  assertCondition(rendered.includes("Evidence Extraction"), "methodology stage catalog should render");
  console.log("✓ methodology renderer is deterministic");
}

async function main(): Promise<void> {
  testRegistryAndLoader();
  testDefaultRegistryIncludesSecurityPack();
  testPackValidation();
  testSecurityPackValidation();
  testMethodologyRenderer();
  testSelectorFindsProfanityPack();
  testEmergencyRouterIsDeterministicAndSelective();
  testEmergencyRouterDetectsExactProfanityPhrase();
  testEmergencyRouterIgnoresStoryMemory();
  testEmergencyRouterUsesUniversalOnlyWhenNoConceptsDetected();
  testEmergencyRouterInfersHostileDialogueConcepts();
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
