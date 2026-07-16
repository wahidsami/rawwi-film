/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerDebate/reviewerDebate.test.ts
 */
import { strict as assert } from "node:assert";

import { createAnalysisFactory } from "../engine/analysisFactory.js";
import { buildReviewerDebatePackage } from "./reviewerDebateEngine.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import {
  PROFANITY_MODULE,
  RELIGION_MODULE,
  NATIONAL_SECURITY_MODULE,
  STATE_LEADERSHIP_MODULE,
  CHILDREN_MODULE,
  VIOLENCE_MODULE,
  SEXUALITY_MODULE,
  DRUGS_MODULE,
  SOCIETY_MODULE,
  FAMILY_VALUES_MODULE,
  HISTORY_MODULE,
  POLITICS_MODULE,
  CRIME_MODULE,
  TRAVEL_MODULE,
} from "../legal/index.js";

function makeRequest() {
  return {
    chunk: {
      text: "A: damn, that plan failed.",
      startOffset: 120,
      endOffset: 146,
      chunkIndex: 4,
    },
    storyMemory: "The conflict escalates after the failed plan.",
    sceneMemory: "Interior, late night, the team argues in a control room.",
    neighboringSentences: ["Before: the plan looked promising.", "After: everyone fell silent."],
    glossary: {
      title: "Glossary Context",
      entries: [
        { term: "damn", articleId: 4, variants: ["damned"], definition: "Direct profanity term." },
      ],
      notes: ["Glossary is knowledge, not classification."],
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis only.",
      rules: ["Identify literal profanity in the chunk."],
      exclusions: ["Do not classify neutral quotations."],
      requiredEvidence: ["Literal profanity present in the chunk."],
      decisionTree: ["Is there literal profanity?", "Does context negate the literal reading?"],
      examples: ["A direct profanity in dialogue."],
      nonExamples: ["Educational mention of a profanity term."],
      articleIds: [4, 5, 17],
      notes: ["Reference module for the V3 unified engine tests."],
    },
    outputSchema: {
      title: "Analysis Response",
      fields: [
        { name: "promptHash", description: "Rendered prompt hash", required: true },
        { name: "stageHashes", description: "Per-stage hashes", required: true },
        { name: "stageTimings", description: "Per-stage timings", required: true },
      ],
      notes: ["Render the JSON contract exactly once."],
      example: {
        promptHash: "sha256",
        stageHashes: [],
        stageTimings: [],
      },
    },
    config: {
      diagnostics: { enabled: false },
    },
  } as const;
}

function makeReviewerReasoningEngine(): ReviewerReasoningEnginePayload {
  return {
    semantic: {
      concept_ids: ["profanity"],
      primary_concept_id: "profanity",
      concept_count: 1,
      confidence: 0.98,
      narrative_intent: "attack",
      context_classification: "dialogue",
      literal_vs_implied_meaning: "literal",
      exception_signals: [],
      evidence_strength: 0.98,
      reasoning_trace: ["narrative=dialogue", "intent=attack"],
    },
    knowledge: {
      selected_packs: [
        { id: "profanity_pack", module_id: "v4_11_profanity", title: "Profanity Pack" },
      ],
      pack_ids: ["profanity_pack"],
      pack_count: 1,
    },
    lessons: [
      { id: "lesson_profanity", title: "Profanity Lesson", version: "1.0.0", summary: "Literal profanity" },
    ],
    blueprints: [
      { id: "blueprint_profanity", title: "Profanity Blueprint", kind: "blueprint_document", summary: "Profanity template", evidence: ["damn"], reasoning: ["literal profanity"], decision: "accept", score: 1, reasons: ["match"], related_ids: [] },
    ],
    patterns: [
      { id: "pattern_profanity", title: "Profanity Pattern", kind: "pattern_document", summary: "Direct profanity", evidence: ["damn"], reasoning: ["literal profanity"], decision: "accept", score: 1, reasons: ["match"], related_ids: [] },
    ],
    relationships: [
      { source: "reviewer_knowledge_pack", pack_id: "profanity_pack", term: "profanity", relation: "supports", note: "Direct profanity" },
    ],
    cases: [
      { articleId: 4, title: "Profanity Case", sourceKind: "gcam_knowledge", primaryCategory: "direct", categories: ["direct"], reviewerDecision: "accept", reviewerExplanation: "Direct profanity" },
    ],
    precedents: {
      best_match: { decisionId: "precedent_profanity", similarity: 0.95, reason: "Direct profanity", articleIds: [4], matchedConcepts: ["profanity"] },
      top_matches: [
        { decisionId: "precedent_profanity", similarity: 0.95, reason: "Direct profanity", articleIds: [4], matchedConcepts: ["profanity"] },
      ],
      total_matches: 1,
    },
    decision_guidance: {
      answer_with: ["why", "evidence", "counterargument", "applicable_articles", "rejected_articles", "confidence"],
      why: "Explain the reviewer conclusion in plain language.",
      evidence: "Cite the exact supporting chunk, context, and precedent evidence.",
      counterargument: "State the strongest alternative interpretation and why it loses.",
      applicable_articles: "List the article ids that support the final decision.",
      rejected_articles: "List the article ids that were considered and rejected, if any.",
      confidence: "Provide a calibrated confidence value between 0 and 1.",
    },
  } as ReviewerReasoningEnginePayload;
}

function testDebatePackageDeterminism(): void {
  const factory = createAnalysisFactory();
  const response = factory.analyze(makeRequest());
  const packageInput = makeReviewerReasoningEngine();
  const legalModules = [
    PROFANITY_MODULE,
    RELIGION_MODULE,
    NATIONAL_SECURITY_MODULE,
    STATE_LEADERSHIP_MODULE,
    CHILDREN_MODULE,
    VIOLENCE_MODULE,
    SEXUALITY_MODULE,
    DRUGS_MODULE,
    SOCIETY_MODULE,
    FAMILY_VALUES_MODULE,
    HISTORY_MODULE,
    POLITICS_MODULE,
    CRIME_MODULE,
    TRAVEL_MODULE,
  ];

  const first = buildReviewerDebatePackage({
    analysisResponse: response,
    legalModules,
    reviewerReasoningEngine: packageInput,
  });
  const second = buildReviewerDebatePackage({
    analysisResponse: response,
    legalModules,
    reviewerReasoningEngine: packageInput,
  });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.reviewerCount, legalModules.length + 1);
  assert.equal(first.executionOrder[0]?.includes("Reviewer"), true);
  assert.equal(first.opinions.length, legalModules.length + 1);
  assert.equal(first.agreementMatrix.length > 0, true);
  assert.equal(first.confidenceDistribution.maximum >= first.confidenceDistribution.minimum, true);
  assert.equal(first.consultationGraph?.entries.length, legalModules.length + 1);
  assert.equal(first.consultationGraph?.consultedReviewerCount > 0, true);
  assert.equal(first.consultationGraph?.triggeredReviewerCount > 0, true);
  const reviewerNames = new Set(first.opinions.map((opinion) => opinion.reviewerName));
  assert(reviewerNames.has("Religion Reviewer"));
  assert(reviewerNames.has("Politics Reviewer"));
  assert(reviewerNames.has("National Security Reviewer"));
  assert(reviewerNames.has("Crime Reviewer"));
  assert(reviewerNames.has("Profanity Reviewer"));
  assert(reviewerNames.has("General Reviewer"));
  const religionConsultation = first.consultationGraph?.entries.find((entry) => entry.reviewerName === "Religion Reviewer");
  assert(religionConsultation);
  assert(religionConsultation?.requestedReviewerNames.includes("History Reviewer"));
  assert(religionConsultation?.requestedReviewerNames.includes("Politics Reviewer"));
  assert(religionConsultation?.requestedReviewerNames.includes("Family Values Reviewer"));
  assert.equal(first.opinions[0]?.selfCritique?.confidenceBefore, first.opinions[0]?.confidence);
  assert.equal(first.opinions[0]?.selfCritique?.reasonChanges.length > 0, true);
  assert.equal(first.opinions[0]?.selfCritique?.whyCouldIBeWrong.length > 0, true);
  assert.equal(first.opinions[0]?.selfCritique?.revision?.approved, true);
  assert.equal(first.opinions[0]?.selfCritique?.finalConfidence, first.opinions[0]?.selfCritique?.confidenceAfter);
}

async function main(): Promise<void> {
  testDebatePackageDeterminism();
  console.log("✓ V3 reviewer debate engine is deterministic and complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
