/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/arbitration/arbitration.test.ts
 */
import { strict as assert } from "node:assert";

import { buildArbitrationDecisionPackage } from "./arbitrationEngine.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import type { ReviewerDebatePackage } from "../reviewerDebate/reviewerDebateTypes.js";

type SharedPackageFixture = {
  semantic: {
    concept_ids: readonly string[];
    primary_concept_id: string;
    concept_count: number;
    confidence: number;
    narrative_intent: string;
    context_classification: string;
    literal_vs_implied_meaning: string;
    exception_signals: readonly string[];
    evidence_strength: number;
    reasoning_trace: readonly string[];
  };
  knowledge: {
    selected_packs: readonly unknown[];
    pack_ids: readonly string[];
    pack_count: number;
    knowledge_retrieval: {
      query_terms: readonly string[];
      top_k: number;
      knowledge_score: number;
      knowledge_confidence: number;
      knowledge_source: string;
      cache_key: string;
      cache_hit: boolean;
      retrieved_packs: readonly unknown[];
      rejected_packs: readonly unknown[];
    };
    decision_memory_retrieval: {
      query_terms: readonly string[];
      top_k: number;
      memory_score: number;
      memory_confidence: number;
      memory_source: string;
      cache_key: string;
      cache_hit: boolean;
      retrieved_memories: readonly unknown[];
      rejected_memories: readonly unknown[];
      selected_memory_ids: readonly string[];
    };
  };
  lessons: readonly unknown[];
  blueprints: readonly unknown[];
  patterns: readonly unknown[];
  relationships: readonly unknown[];
  cases: readonly unknown[];
  precedents: {
    best_match: unknown | null;
    top_matches: readonly {
      decisionId: string;
      similarity: number;
      reason: string;
      articleIds: readonly number[];
      matchedConcepts: readonly string[];
    }[];
    total_matches: number;
  };
  decision_records: readonly unknown[];
  gpt_reviewer_assistant: {
    providerName: string;
    modelName: string;
    promptHash: string;
    responseHash: string;
    latencyMs: number;
    reasoning: string;
    alternativeInterpretations: readonly string[];
    confidence: number;
    supportingEvidence: readonly string[];
    contradictingEvidence: readonly string[];
    applicableArticles: readonly number[];
    rejectedArticles: readonly number[];
    riskAnalysis: string;
    narrativeAnalysis: string;
    humanLikeExplanation: string;
    recommendation: string;
  };
  reasoning_pipeline: {
    stages: readonly unknown[];
    literalMeaning: string;
    impliedMeaning: string;
    narrativeContext: string;
    speakerAnalysis: string;
    victimAnalysis: string;
    socialImpact: string;
    applicableGcamArticles: readonly number[];
    rejectedGcamArticles: readonly number[];
    supportingEvidence: readonly string[];
    counterEvidence: readonly string[];
    confidenceExplanation: string;
    preliminaryDecision: {
      status: "accept" | "reject" | "needs_review";
      reason: string;
      confidence: number;
      applicableArticles: readonly number[];
      rejectedArticles: readonly number[];
    };
  };
  decision_guidance: Record<string, unknown>;
};

function buildSharedPackage(): SharedPackageFixture {
  return {
    semantic: {
      concept_ids: ["profanity", "insult"],
      primary_concept_id: "profanity",
      concept_count: 2,
      confidence: 0.95,
      narrative_intent: "attack",
      context_classification: "dialogue",
      literal_vs_implied_meaning: "literal",
      exception_signals: [],
      evidence_strength: 0.96,
      reasoning_trace: ["Direct insult is explicit."],
    },
    knowledge: {
      selected_packs: [],
      pack_ids: [],
      pack_count: 0,
      knowledge_retrieval: {
        query_terms: ["profanity"],
        top_k: 3,
        knowledge_score: 0.91,
        knowledge_confidence: 0.9,
        knowledge_source: "reviewer_knowledge",
        cache_key: "calibration-test",
        cache_hit: false,
        retrieved_packs: [],
        rejected_packs: [],
      },
      decision_memory_retrieval: {
        query_terms: ["profanity"],
        top_k: 3,
        memory_score: 0.88,
        memory_confidence: 0.87,
        memory_source: "decision_memory",
        cache_key: "calibration-test",
        cache_hit: false,
        retrieved_memories: [],
        rejected_memories: [],
        selected_memory_ids: [],
      },
    },
    lessons: [],
    blueprints: [],
    patterns: [],
    relationships: [],
    cases: [],
    precedents: {
      best_match: null,
      top_matches: [
        {
          decisionId: "precedent-1",
          similarity: 0.92,
          reason: "Direct insulting phrase matched a prior decision.",
          articleIds: [4],
          matchedConcepts: ["profanity"],
        },
      ],
      total_matches: 1,
    },
    decision_records: [],
    gpt_reviewer_assistant: {
      providerName: "openai",
      modelName: "gpt-4.1",
      promptHash: "prompt-hash",
      responseHash: "response-hash",
      latencyMs: 120,
      reasoning: "The phrase is a direct insult.",
      alternativeInterpretations: ["Could be quoted, but context is direct."],
      confidence: 0.94,
      supportingEvidence: ["Direct insult is explicit."],
      contradictingEvidence: [],
      applicableArticles: [4],
      rejectedArticles: [1],
      riskAnalysis: "Low ambiguity.",
      narrativeAnalysis: "Direct hostile dialogue.",
      humanLikeExplanation: "A human reviewer would likely accept this.",
      recommendation: "Assist reviewer reasoning only.",
    },
    reasoning_pipeline: {
      stages: [
        {
          key: "literal_meaning",
          title: "Literal Meaning",
          summary: "Direct insult is explicit.",
          confidence: 0.96,
        },
      ],
      literalMeaning: "Direct insult is explicit.",
      impliedMeaning: "Attack",
      narrativeContext: "Hostile dialogue.",
      speakerAnalysis: "Speaker A",
      victimAnalysis: "Target B",
      socialImpact: "hostile",
      applicableGcamArticles: [4],
      rejectedGcamArticles: [],
      supportingEvidence: ["Direct insult is explicit."],
      counterEvidence: [],
      confidenceExplanation: "High confidence because the signal is explicit.",
      preliminaryDecision: {
        status: "accept",
        reason: "Direct insult is explicit.",
        confidence: 0.95,
        applicableArticles: [4],
        rejectedArticles: [],
      },
    },
    decision_guidance: {
      answer_with: ["why", "evidence", "counterargument", "applicable_articles", "rejected_articles", "confidence", "recommendation"],
      why: "Explain the reviewer conclusion in plain language.",
      evidence: "Cite the exact supporting chunk, context, and precedent evidence.",
      counterargument: "State the strongest alternative interpretation and why it loses.",
      applicable_articles: "List the article ids that support the final decision.",
      rejected_articles: "List the article ids that were considered and rejected, if any.",
      confidence: "Provide a calibrated confidence value between 0 and 1.",
      recommendation: "State the reviewer recommendation only as reasoning support for the legal engine.",
    },
  };
}

function buildDebatePackage(): ReviewerDebatePackage {
  return {
    sharedPackage: buildSharedPackage() as ReviewerReasoningEnginePayload,
    primaryDecision: {
      moduleId: "profanity",
      moduleTitle: "Profanity",
      status: "accept",
      confidence: 0.94,
      articleIds: [4],
      reason: "Direct insult is established.",
    },
    reviewerCount: 3,
    executionOrder: ["Profanity Reviewer", "Religion Reviewer", "General Reviewer"],
    reviewerDurations: [
      { reviewerId: "profanity", reviewerName: "Profanity Reviewer", durationMs: 1 },
      { reviewerId: "religion", reviewerName: "Religion Reviewer", durationMs: 2 },
      { reviewerId: "general_reviewer", reviewerName: "General Reviewer", durationMs: 3 },
    ],
    opinions: [
      {
        reviewerId: "profanity",
        reviewerName: "Profanity Reviewer",
        moduleId: "profanity",
        moduleTitle: "Profanity",
        applicable: true,
        status: "accept",
        confidence: 0.94,
        reasoning: "Direct profanity is present.",
        supportingEvidence: ["exact quote"],
        supportingKnowledge: {
          lessons: ["lesson-profanity"],
          blueprints: ["blueprint-profanity"],
          patterns: ["pattern-profanity"],
          relationships: ["relationship-profanity"],
          cases: ["case-profanity"],
          precedents: ["precedent-profanity"],
        },
        suggestedArticles: [4],
        rejectedArticles: [7],
        counterargument: "Could be quoted, but context is direct.",
        riskLevel: "critical",
        escalationRecommendation: "No escalation required; specialist opinion is stable.",
        needsHumanReview: false,
        independence: "independent",
        durationMs: 1,
      },
      {
        reviewerId: "religion",
        reviewerName: "Religion Reviewer",
        moduleId: "religion",
        moduleTitle: "Religion",
        applicable: true,
        status: "reject",
        confidence: 0.72,
        reasoning: "No religious content is present.",
        supportingEvidence: ["exact quote"],
        supportingKnowledge: {
          lessons: ["lesson-religion"],
          blueprints: ["blueprint-religion"],
          patterns: ["pattern-religion"],
          relationships: ["relationship-religion"],
          cases: ["case-religion"],
          precedents: ["precedent-religion"],
        },
        suggestedArticles: [1],
        rejectedArticles: [4],
        counterargument: "The line is not religious.",
        riskLevel: "medium",
        escalationRecommendation: "No escalation required; specialist opinion is stable.",
        needsHumanReview: false,
        independence: "independent",
        durationMs: 2,
      },
      {
        reviewerId: "general_reviewer",
        reviewerName: "General Reviewer",
        moduleId: "general_reviewer",
        moduleTitle: "General Reviewer",
        applicable: true,
        status: "accept",
        confidence: 0.89,
        reasoning: "General consensus supports accept.",
        supportingEvidence: ["exact quote"],
        supportingKnowledge: {
          lessons: ["lesson-general"],
          blueprints: ["blueprint-general"],
          patterns: ["pattern-general"],
          relationships: ["relationship-general"],
          cases: ["case-general"],
          precedents: ["precedent-general"],
        },
        suggestedArticles: [4],
        rejectedArticles: [1],
        counterargument: "No stronger counterargument identified.",
        riskLevel: "critical",
        escalationRecommendation: "No escalation required; consensus is stable.",
        needsHumanReview: false,
        independence: "independent",
        durationMs: 3,
      },
    ],
    opinionSummaries: [],
    agreementMatrix: [
      {
        leftReviewerId: "profanity",
        rightReviewerId: "religion",
        sameStatus: false,
        articleOverlap: 0,
        knowledgeOverlap: 0,
        evidenceOverlap: 1,
        confidenceDelta: 0.22,
        agreementScore: 0.78,
        disagreementScore: 0.22,
      },
    ],
    disagreementMatrix: [
      {
        leftReviewerId: "profanity",
        rightReviewerId: "religion",
        sameStatus: false,
        articleOverlap: 0,
        knowledgeOverlap: 0,
        evidenceOverlap: 1,
        confidenceDelta: 0.22,
        agreementScore: 0.78,
        disagreementScore: 0.22,
      },
    ],
    highestConfidenceReviewer: "Profanity Reviewer",
    lowestConfidenceReviewer: "Religion Reviewer",
    conflictingArticles: [1, 4],
    supportingEvidenceOverlap: ["exact quote"],
    knowledgeOverlap: ["lesson-profanity"],
    confidenceDistribution: {
      minimum: 0.72,
      maximum: 0.94,
      average: 0.85,
      median: 0.89,
      spread: 0.22,
      buckets: {
        low: 0,
        medium: 1,
        high: 1,
        critical: 1,
      },
    },
    consensusScore: 0.67,
    metrics: {
      agreement: 0.78,
      disagreement: 0.22,
      averageConfidence: 0.85,
      participation: 1,
      articleOverlap: 0,
      knowledgeOverlap: 0,
      evidenceOverlap: 1,
      consensusPercentage: 0.67,
    },
  } as ReviewerDebatePackage;
}

function testDeterministicArbitration(): void {
  const debate = buildDebatePackage();
  const first = buildArbitrationDecisionPackage({ debate });
  const second = buildArbitrationDecisionPackage({ debate });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
}

function testJudgeSelectionAndConfidence(): void {
  const arbitration = buildArbitrationDecisionPackage({ debate: buildDebatePackage() });
  assert.equal(arbitration.winningReviewer.reviewerId, "profanity");
  assert.equal(arbitration.finalDecisionStatus, "accept");
  assert.equal(arbitration.finalArticle, 4);
  assert.equal(arbitration.winningEvidence[0], "exact quote");
  assert.equal(arbitration.confidence <= 0.94, true);
  assert.equal(arbitration.confidenceAdjustment <= 1, true);
}

function testConflictAndEscalationResolution(): void {
  const debate = buildDebatePackage();
  const arbitration = buildArbitrationDecisionPackage({
    debate: {
      ...debate,
      consensusScore: 0.4,
      metrics: {
        ...debate.metrics,
        disagreement: 0.7,
        agreement: 0.3,
      },
    },
  });

  assert.equal(arbitration.needsHumanReview, true);
  assert.equal(arbitration.escalationRecommendation.includes("Escalate"), true);
  assert.equal(arbitration.rejectedReviewers.length, 2);
  assert.equal(arbitration.rejectedReasons.length, 2);
}

function testConfidenceCalibrationRanges(): void {
  const weakShared = buildSharedPackage();
  const strongShared = buildSharedPackage();
  const conflictingShared = buildSharedPackage();
  const weak = buildArbitrationDecisionPackage({
    debate: {
      ...buildDebatePackage(),
      sharedPackage: ({
        ...weakShared,
        semantic: {
          ...weakShared.semantic,
          confidence: 0.22,
          evidence_strength: 0.2,
        },
        knowledge: {
          ...weakShared.knowledge,
          knowledge_retrieval: {
            ...weakShared.knowledge.knowledge_retrieval,
            knowledge_confidence: 0.18,
          },
          decision_memory_retrieval: {
            ...weakShared.knowledge.decision_memory_retrieval,
            memory_confidence: 0.12,
          },
        },
        precedents: {
          ...weakShared.precedents,
          top_matches: [],
        },
        gpt_reviewer_assistant: {
          ...weakShared.gpt_reviewer_assistant,
          confidence: 0.2,
          contradictingEvidence: ["counter"],
        },
        reasoning_pipeline: {
          ...weakShared.reasoning_pipeline,
          counterEvidence: ["counter"],
        },
      } as ReviewerReasoningEnginePayload),
      consensusScore: 0.18,
      metrics: {
        ...buildDebatePackage().metrics,
        agreement: 0.2,
        disagreement: 0.8,
      },
    },
  });
  assert.equal(weak.confidence >= 0.55, true);
  assert.equal(weak.confidence < 0.7, true);

  const strong = buildArbitrationDecisionPackage({
    debate: {
      ...buildDebatePackage(),
      sharedPackage: ({
        ...strongShared,
        semantic: {
          ...strongShared.semantic,
          confidence: 0.99,
          evidence_strength: 0.98,
        },
        knowledge: {
          ...strongShared.knowledge,
          knowledge_retrieval: {
            ...strongShared.knowledge.knowledge_retrieval,
            knowledge_confidence: 0.97,
          },
          decision_memory_retrieval: {
            ...strongShared.knowledge.decision_memory_retrieval,
            memory_confidence: 0.96,
          },
        },
        precedents: {
          ...strongShared.precedents,
          top_matches: [
            {
              decisionId: "precedent-1",
              similarity: 0.98,
              reason: "Strong precedent.",
              articleIds: [4],
              matchedConcepts: ["profanity"],
            },
          ],
        },
        gpt_reviewer_assistant: {
          ...strongShared.gpt_reviewer_assistant,
          confidence: 0.99,
          contradictingEvidence: [],
        },
        reasoning_pipeline: {
          ...strongShared.reasoning_pipeline,
          counterEvidence: [],
        },
      } as ReviewerReasoningEnginePayload),
      consensusScore: 0.99,
      metrics: {
        ...buildDebatePackage().metrics,
        agreement: 0.99,
        disagreement: 0.01,
      },
    },
  });
  assert.equal(strong.confidence <= 0.98, true);
  assert.equal(strong.confidence >= 0.91, true);

  const perfectConsensus = buildArbitrationDecisionPackage({
    debate: {
      ...buildDebatePackage(),
      sharedPackage: ({
        ...strongShared,
        semantic: {
          ...strongShared.semantic,
          confidence: 1,
          evidence_strength: 1,
        },
        knowledge: {
          ...strongShared.knowledge,
          knowledge_retrieval: {
            ...strongShared.knowledge.knowledge_retrieval,
            knowledge_confidence: 1,
          },
          decision_memory_retrieval: {
            ...strongShared.knowledge.decision_memory_retrieval,
            memory_confidence: 1,
          },
        },
        precedents: {
          ...strongShared.precedents,
          top_matches: [
            {
              decisionId: "precedent-perfect",
              similarity: 1,
              reason: "Perfect precedent alignment.",
              articleIds: [4],
              matchedConcepts: ["profanity"],
            },
          ],
        },
        gpt_reviewer_assistant: {
          ...strongShared.gpt_reviewer_assistant,
          confidence: 1,
          contradictingEvidence: [],
        },
        reasoning_pipeline: {
          ...strongShared.reasoning_pipeline,
          counterEvidence: [],
        },
      } as ReviewerReasoningEnginePayload),
      consensusScore: 1,
      metrics: {
        ...buildDebatePackage().metrics,
        agreement: 1,
        disagreement: 0,
      },
    },
  });
  assert.equal(perfectConsensus.confidence, 0.98);

  const conflicting = buildArbitrationDecisionPackage({
    debate: {
      ...buildDebatePackage(),
      sharedPackage: ({
        ...conflictingShared,
        semantic: {
          ...conflictingShared.semantic,
          confidence: 0.74,
          evidence_strength: 0.7,
        },
        knowledge: {
          ...conflictingShared.knowledge,
          knowledge_retrieval: {
            ...conflictingShared.knowledge.knowledge_retrieval,
            knowledge_confidence: 0.66,
          },
          decision_memory_retrieval: {
            ...conflictingShared.knowledge.decision_memory_retrieval,
            memory_confidence: 0.63,
          },
        },
        precedents: {
          ...conflictingShared.precedents,
          top_matches: [
            {
              decisionId: "precedent-conflict",
              similarity: 0.62,
              reason: "Moderate precedent.",
              articleIds: [4],
              matchedConcepts: ["profanity"],
            },
          ],
        },
        gpt_reviewer_assistant: {
          ...conflictingShared.gpt_reviewer_assistant,
          confidence: 0.68,
          contradictingEvidence: ["counter"],
        },
        reasoning_pipeline: {
          ...conflictingShared.reasoning_pipeline,
          counterEvidence: ["counter"],
        },
      } as ReviewerReasoningEnginePayload),
      consensusScore: 0.58,
      metrics: {
        ...buildDebatePackage().metrics,
        agreement: 0.48,
        disagreement: 0.52,
      },
    },
  });
  assert.equal(conflicting.confidence >= 0.55, true);
  assert.equal(conflicting.confidence <= 0.78, true);
}

async function main(): Promise<void> {
  testDeterministicArbitration();
  testJudgeSelectionAndConfidence();
  testConflictAndEscalationResolution();
  testConfidenceCalibrationRanges();
  console.log("✓ V3 arbitration judge is deterministic and stable");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
