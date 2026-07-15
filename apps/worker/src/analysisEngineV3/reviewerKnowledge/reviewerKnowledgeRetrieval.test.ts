/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRetrieval.test.ts
 */
import { strict as assert } from "node:assert";

import { normalizeConceptConfidence } from "../concepts/conceptConfidence.js";
import type { Concept, ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { createDefaultReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";
import { createReviewerKnowledgeRetrievalReport } from "./reviewerKnowledgeRetrieval.js";
import { selectReviewerKnowledgePacks } from "./reviewerKnowledgeSelector.js";

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

function makeAssessment(): ReviewerAssessment {
  return Object.freeze({
    methodologyId: "universal_reviewer_methodology_v1",
    methodologyTitle: "Universal Reviewer Methodology",
    narrativeUnderstanding: "The text contains an explicit profanity signal.",
    speaker: "speaker",
    target: "listener",
    victim: null,
    narrativeIntent: "attack",
    evidenceStrength: 0.94,
    contextClassification: "dialogue",
    literalVsImpliedMeaning: "literal",
    exceptionSignals: Object.freeze([]),
    confidence: 0.93,
    applicableConceptIds: Object.freeze(["profanity"]),
    conceptConfidence: 0.96,
    conceptCount: 1,
    reasoningTrace: Object.freeze(["The utterance is directly abusive."]),
    stageResults: Object.freeze([]),
  });
}

function testRetrievalReportIsRankedAndDeterministic(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const conceptContext = makeConceptContext();
  const assessment = makeAssessment();

  const first = createReviewerKnowledgeRetrievalReport({
    assessment,
    conceptContext,
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis",
      articleIds: [11],
    },
    registry,
  });
  const second = createReviewerKnowledgeRetrievalReport({
    assessment,
    conceptContext,
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis",
      articleIds: [11],
    },
    registry,
  });

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(first.selectedPacks[0]?.id, "v3_00_universal");
  assert.equal(first.selectedPacks.some((pack) => pack.id === "v4_11_profanity"), true);
  assert.equal(first.retrievedPacks.length > 0, true);
  assert.equal(first.retrievedPacks[0]?.confidence >= 0, true);
  assert.equal(first.retrievedPacks[0]?.source.length > 0, true);
  assert.equal(first.decisionMemoryRetrieval.retrievedMemories.length > 0, true);
  assert.equal(first.decisionMemoryRetrieval.retrievedMemories[0]?.similarity >= 0, true);
  assert.equal(first.decisionMemoryRetrieval.retrievedMemories[0]?.memoryInfluence >= 0, true);
  assert.equal(first.knowledgeConfidence >= 0, true);
  assert.equal(selectReviewerKnowledgePacks(assessment, conceptContext, registry)[0]?.id, "v3_00_universal");
  console.log("✓ reviewer knowledge retrieval is ranked, cached, and deterministic");
}

function main(): void {
  testRetrievalReportIsRankedAndDeterministic();
  console.log("\nAll reviewer knowledge retrieval tests passed.");
}

main();
