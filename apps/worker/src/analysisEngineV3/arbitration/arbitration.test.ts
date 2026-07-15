/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/arbitration/arbitration.test.ts
 */
import { strict as assert } from "node:assert";

import { buildArbitrationDecisionPackage } from "./arbitrationEngine.js";
import type { ReviewerDebatePackage } from "../reviewerDebate/reviewerDebateTypes.js";

function buildDebatePackage(): ReviewerDebatePackage {
  return {
    sharedPackage: {
      semantic: {},
      knowledge: {},
      lessons: [],
      blueprints: [],
      patterns: [],
      relationships: [],
      cases: [],
      precedents: {
        best_match: null,
        top_matches: [],
        total_matches: 0,
      },
      decision_guidance: {},
    } as never,
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

async function main(): Promise<void> {
  testDeterministicArbitration();
  testJudgeSelectionAndConfidence();
  testConflictAndEscalationResolution();
  console.log("✓ V3 arbitration judge is deterministic and stable");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
