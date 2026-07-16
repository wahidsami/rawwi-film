/**
 * Determinism tests for reviewer decision preparation.
 */
import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";
import { createLegalContextResult } from "./legalContext.js";
import { createLegalEvidenceResult } from "./legalEvidence.js";
import type { IntelligenceBuilderInput } from "../intelligence/intelligenceContext.js";
import { buildReviewerDecisionContext } from "./reviewerDecisionPreparation.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";

function makeIntelligence(): IntelligenceBuilderInput {
  return {
    moduleId: "v4_11_profanity",
    storyMemory: "Story memory is stable.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "hostile",
      storyPosition: "escalation",
      relationship: "enemy",
      emotionalTone: "hostile",
      condemnation: false,
      approval: false,
      neutrality: false,
      historicalContext: false,
      dream: false,
      flashback: false,
      comedy: false,
      satire: false,
      threat: false,
      instruction: false,
      news: false,
      documentary: false,
      dialogue: true,
      narration: false,
      sceneDescription: false,
      confidence: 0.96,
    },
    evidence: createLegalEvidenceResult({
      candidates: [
        {
          text: "يا كلب",
          startOffset: 12,
          endOffset: 17,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    }),
    semantic: {
      semanticMeaning: "Direct insult detected.",
      narrativeIntent: "hostile",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "Story memory is stable.",
      sceneMemory: "Scene memory is stable.",
      localContext: "A: يا كلب",
      chunkContext: "Chunk context is stable.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "Direct hostile dialogue.",
      confidence: 0.95,
    }),
    glossary: { title: "Glossary", entries: [] },
  };
}

function makeReviewerReasoningEngine(): ReviewerReasoningEnginePayload {
  return {
    semantic: {
      concept_ids: ["profanity"],
      primary_concept_id: "profanity",
      concept_count: 1,
      confidence: 0.95,
      narrative_intent: "hostile",
      context_classification: "dialogue",
      literal_vs_implied_meaning: "literal",
      exception_signals: [],
      evidence_strength: 0.97,
      reasoning_trace: ["Literal profanity present."],
    },
    knowledge: {
      selected_packs: [{ id: "pack_1", title: "Pack One" }],
      pack_ids: ["pack_1"],
      pack_count: 1,
    },
    lessons: [{ id: "lesson_1", title: "Lesson One", benchmark_references: ["benchmark_1"] }],
    blueprints: [{ id: "blueprint_1", title: "Blueprint One" }],
    patterns: [{ id: "pattern_1", title: "Pattern One" }],
    relationships: [{ term: "profanity", relation: "maps_to", note: "Demo relationship" }],
    cases: [{ articleId: 4, title: "Case One", sourceKind: "gcam_knowledge", primaryCategory: "direct", categories: ["direct"], reviewerDecision: "accept", reviewerExplanation: "Direct profanity" }],
    precedents: {
      best_match: { decisionId: "decision_1", similarity: 0.95, reason: "Matched precedent", articleIds: [4], matchedConcepts: ["profanity"] },
      top_matches: [{ decisionId: "decision_1", similarity: 0.95, reason: "Matched precedent", articleIds: [4], matchedConcepts: ["profanity"] }],
      total_matches: 1,
    },
    decision_records: [{ id: "record_1", title: "Record One" }],
    reasoning_pipeline: {
      stages: [],
      literalMeaning: "Literal profanity appears in the chunk.",
      impliedMeaning: "Direct hostile speech.",
      narrativeContext: "Direct hostile dialogue.",
      speakerAnalysis: "speaker=Character A",
      victimAnalysis: "victim=Character B",
      socialImpact: "condemned",
      applicableGcamArticles: [4],
      rejectedGcamArticles: [],
      supportingEvidence: ["يا كلب"],
      counterEvidence: [],
      confidenceExplanation: "High confidence because the evidence is direct.",
      preliminaryDecision: {
        status: "accept",
        reason: "Direct hostile speech with clear evidence.",
        confidence: 0.95,
        applicableArticles: [4],
        rejectedArticles: [],
      },
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
  };
}

function testDeterministicReviewerDecisionContext(): void {
  const intelligence = buildIntelligenceContext(makeIntelligence());
  const reasoningEngine = makeReviewerReasoningEngine();
  const first = buildReviewerDecisionContext({
    intelligence,
    reviewerReasoningEngine: reasoningEngine,
    subjectModuleArticleIds: [4],
    reviewerAssessment: {
      methodologyId: "methodology_1",
      methodologyTitle: "Methodology One",
      narrativeUnderstanding: "dialogue | hostile",
      speaker: "Character A",
      target: "Character B",
      victim: "Character B",
      narrativeIntent: "hostile",
      evidenceStrength: 0.97,
      contextClassification: "dialogue",
      literalVsImpliedMeaning: "literal",
      exceptionSignals: [],
      confidence: 0.94,
      applicableConceptIds: ["profanity"],
      conceptConfidence: 0.95,
      conceptCount: 1,
      reasoningTrace: ["Literal profanity present."],
      stageResults: [],
    } satisfies ReviewerAssessment,
  });
  const second = buildReviewerDecisionContext({
    intelligence,
    reviewerReasoningEngine: reasoningEngine,
    subjectModuleArticleIds: [4],
    reviewerAssessment: {
      methodologyId: "methodology_1",
      methodologyTitle: "Methodology One",
      narrativeUnderstanding: "dialogue | hostile",
      speaker: "Character A",
      target: "Character B",
      victim: "Character B",
      narrativeIntent: "hostile",
      evidenceStrength: 0.97,
      contextClassification: "dialogue",
      literalVsImpliedMeaning: "literal",
      exceptionSignals: [],
      confidence: 0.94,
      applicableConceptIds: ["profanity"],
      conceptConfidence: 0.95,
      conceptCount: 1,
      reasoningTrace: ["Literal profanity present."],
      stageResults: [],
    } satisfies ReviewerAssessment,
  });

  assert.deepStrictEqual(first, second, "reviewer decision context should be deterministic");
  assert.equal(first.reasoning.stages.length, 12, "reasoning pipeline should contain 12 stages");
  assert.equal(first.reasoning.articleEvaluations.length, 1, "article-by-article reasoning should evaluate each article independently");
  assert.equal(first.reasoning.articleEvaluations[0]?.status, "PASS", "the supplied article should pass in this deterministic test");
  assert.equal(first.reasoning.preliminaryDecision.status, "accept", "preliminary decision should be stable");
  assert(first.knowledgeAssets !== null, "knowledge assets should be present");
  console.log("✓ reviewer decision context is deterministic");
}

async function main(): Promise<void> {
  testDeterministicReviewerDecisionContext();
  console.log("\nAll reviewer decision preparation tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
