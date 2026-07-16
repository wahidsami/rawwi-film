/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/explanation/explanation.test.ts
 */
import { strict as assert } from "node:assert";

import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type { ReviewerDebatePackage } from "../reviewerDebate/reviewerDebateTypes.js";
import type { ArbitrationDecisionPackage } from "../arbitration/arbitrationTypes.js";
import { buildExplanationPackage } from "./explanationEngine.js";

function buildAnalysisResponse(): AnalysisResponse {
  return {
    promptHash: "prompt",
    semanticHash: "semantic",
    legalHash: "legal",
    stageHashes: [],
    stageTimings: [],
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "attack",
      storyPosition: "middle",
      relationship: "conflict",
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
      confidence: 0.9,
    },
    evidence: {
      candidates: [
        {
          id: "candidate-1",
          quote: "exact quote",
          text: "exact quote",
          offsetStart: 1,
          offsetEnd: 12,
          startOffset: 1,
          endOffset: 12,
          confidence: 0.95,
          concepts: ["profanity"],
          entities: [],
          reason: "direct support",
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.95,
    },
    semantic: {
      semanticMeaning: "direct profanity",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.98,
    },
    context: {
      storyMemory: "story memory",
      sceneMemory: "scene memory",
      localContext: "exact quote",
      chunkContext: "chunk context",
      neighboringSentences: ["neighbor"],
      narrativeContext: "context summary",
      confidence: 0.92,
    },
    intelligence: {
      semantic: {} as never,
      narrative: {} as never,
      evidence: {} as never,
      context: {} as never,
      conceptContext: {
        conceptIds: ["profanity"],
        primaryConceptId: "profanity",
        conceptCount: 1,
        confidence: 0.99,
      } as never,
      entities: [],
      flags: {} as never,
      speaker: "A",
      target: "B",
      victim: "B",
      narrativeIntent: "attack",
      dialogueMode: "dialogue",
      interpretationMode: "literal",
      legalConcepts: ["profanity"],
      evidenceAssessment: { candidateCount: 1 } as never,
    } as never,
    legalDecision: {
      moduleId: "profanity",
      moduleTitle: "Profanity",
      articleIds: [4],
      applies: true,
      status: "accept",
      reason: "direct profanity",
      confidence: 0.97,
      semantic: {} as never,
      narrative: {} as never,
      evidence: {
        candidates: [
          {
            text: "exact quote",
            startOffset: 1,
            endOffset: 12,
            confidence: 0.95,
            source: "chunk",
          },
        ],
        primaryCandidateIndex: 0,
        admissible: true,
        confidence: 0.95,
      } as never,
      context: {} as never,
      exceptions: [],
      finding: null,
      trace: ["finding_built"],
    } as never,
    diagnostics: {
      executionOrder: [],
      promptHash: "prompt",
      semanticHash: "semantic",
      legalHash: "legal",
      stageHashes: [],
      stageTimings: [],
    } as never,
  } as unknown as AnalysisResponse;
}

function buildFinding(): V3RuntimeFinding {
  return {
    source: "ai",
    article_id: 4,
    atom_id: "atom-1",
    severity: "high",
    confidence: 0.97,
    title_ar: "Profanity",
    description_ar: "Direct profanity",
    evidence_snippet: "exact quote",
    rationale_ar: "supported",
    final_ruling: "accept",
    detection_pass: "profanity",
    location: {
      start_offset: 1,
      end_offset: 12,
      start_line: null,
      end_line: null,
      v3: {},
    },
    start_offset_global: 1,
    end_offset_global: 12,
    canonical_atom: null,
    lineage_id: "lineage-1",
    parent_lineage_id: null,
    evidence_hash: null,
    canonical_hash: null,
    is_interpretive: false,
    depiction_type: "unknown",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: 0.92,
    lexical_confidence: 0.95,
    policy_confidence: 0.98,
  } as unknown as V3RuntimeFinding;
}

function buildDebate(): ReviewerDebatePackage {
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
      confidence: 0.97,
      articleIds: [4],
      reason: "direct profanity",
    },
    reviewerCount: 2,
    executionOrder: ["Profanity Reviewer", "General Reviewer"],
    reviewerDurations: [],
    opinions: [
      {
        reviewerId: "profanity",
        reviewerName: "Profanity Reviewer",
        moduleId: "profanity",
        moduleTitle: "Profanity",
        applicable: true,
        status: "accept",
        confidence: 0.97,
        reasoning: "direct profanity",
        supportingEvidence: ["exact quote"],
        supportingKnowledge: {
          lessons: ["lesson-1"],
          blueprints: ["blueprint-1"],
          patterns: ["pattern-1"],
          relationships: ["relationship-1"],
          cases: ["case-1"],
          precedents: ["precedent-1"],
        },
        suggestedArticles: [4],
        rejectedArticles: [],
        counterargument: "none",
        riskLevel: "critical",
        escalationRecommendation: "No escalation required; specialist opinion is stable.",
        needsHumanReview: false,
        independence: "independent",
        durationMs: 1,
        selfCritique: {
          whyCouldIBeWrong: "A stronger contextual reading could exist.",
          contradictingEvidence: ["possible counter reading"],
          assumptions: ["Assumed direct profanity"],
          possibleDisagreement: "Another reviewer could disagree on context.",
          missedContext: "Missing broader scene context.",
          confidenceBefore: 0.97,
          confidenceAfter: 0.94,
          confidenceDelta: -0.03,
          reasonChanges: ["Initial reason: direct profanity", "Self-critique: context could soften the reading."],
        },
      },
      {
        reviewerId: "general_reviewer",
        reviewerName: "General Reviewer",
        moduleId: "general_reviewer",
        moduleTitle: "General Reviewer",
        applicable: true,
        status: "accept",
        confidence: 0.9,
        reasoning: "consensus",
        supportingEvidence: ["exact quote"],
        supportingKnowledge: {
          lessons: ["lesson-1"],
          blueprints: ["blueprint-1"],
          patterns: ["pattern-1"],
          relationships: ["relationship-1"],
          cases: ["case-1"],
          precedents: ["precedent-1"],
        },
        suggestedArticles: [4],
        rejectedArticles: [],
        counterargument: "none",
        riskLevel: "critical",
        escalationRecommendation: "No escalation required; consensus is stable.",
        needsHumanReview: false,
        independence: "independent",
        durationMs: 1,
        selfCritique: {
          whyCouldIBeWrong: "A contextual exception could exist.",
          contradictingEvidence: ["possible alternate reading"],
          assumptions: ["Assumed consensus"],
          possibleDisagreement: "Another reviewer may prioritize a minority context.",
          missedContext: "Potential broader narrative framing.",
          confidenceBefore: 0.9,
          confidenceAfter: 0.87,
          confidenceDelta: -0.03,
          reasonChanges: ["Initial reason: consensus", "Self-critique: minority context may matter."],
        },
      },
    ],
    opinionSummaries: [],
    agreementMatrix: [],
    disagreementMatrix: [],
    highestConfidenceReviewer: "Profanity Reviewer",
    lowestConfidenceReviewer: "General Reviewer",
    conflictingArticles: [],
    supportingEvidenceOverlap: ["exact quote"],
    knowledgeOverlap: ["lesson-1"],
    confidenceDistribution: {
      minimum: 0.9,
      maximum: 0.97,
      average: 0.935,
      median: 0.935,
      spread: 0.07,
      buckets: {
        low: 0,
        medium: 0,
        high: 1,
        critical: 1,
      },
    },
    consensusScore: 1,
    metrics: {
      agreement: 1,
      disagreement: 0,
      averageConfidence: 0.935,
      participation: 1,
      articleOverlap: 1,
      knowledgeOverlap: 1,
      evidenceOverlap: 1,
      consensusPercentage: 1,
    },
  } as ReviewerDebatePackage;
}

function buildArbitration(): ArbitrationDecisionPackage {
  const debate = buildDebate();
  return {
    debate,
    winningReviewer: {
      reviewerId: "profanity",
      reviewerName: "Profanity Reviewer",
      status: "accept",
      confidence: 0.95,
    },
    winningOpinion: debate.opinions[0]!,
    winningOpinionIndex: 0,
    winningReason: "direct profanity",
    winningEvidence: ["exact quote"],
    winningKnowledge: {
      lessons: ["lesson-1"],
      blueprints: ["blueprint-1"],
      patterns: ["pattern-1"],
      precedents: ["precedent-1"],
      cases: ["case-1"],
      relationships: ["relationship-1"],
    },
    winningLessons: ["lesson-1"],
    winningBlueprints: ["blueprint-1"],
    winningPatterns: ["pattern-1"],
    winningPrecedents: ["precedent-1"],
    winningCases: ["case-1"],
    winningRelationships: ["relationship-1"],
    winningArticle: 4,
    finalArticle: 4,
    rejectedReviewers: [
      {
        reviewerId: "general_reviewer",
        reviewerName: "General Reviewer",
        reason: "consensus",
        status: "accept",
        confidence: 0.9,
      },
    ],
    rejectedReasons: ["consensus"],
    confidence: 0.95,
    confidenceAdjustment: 0.98,
    consensusScore: 1,
    agreementMatrix: [],
    disagreementMatrix: [],
    confidenceDistribution: debate.confidenceDistribution,
    metrics: debate.metrics,
    conflicts: [],
    needsHumanReview: false,
    escalationRecommendation: "No escalation required; arbitration consensus is stable.",
    decisionExplanation: "Winning reviewer: Profanity Reviewer | Winning status: accept | Winning article: 4 | Consensus score: 1.000000 | Confidence adjustment: 0.980000 | Final confidence: 0.950000 | Escalation: not required",
    decisionDurationMs: 0,
    finalDecisionStatus: "accept",
  } as ArbitrationDecisionPackage;
}

function testExplanationDeterminism(): void {
  const packageOne = buildExplanationPackage({
    jobId: "job-1",
    chunkId: "chunk-1",
    pipelineVersion: "v2",
    analysisResponse: buildAnalysisResponse(),
    findings: [buildFinding()],
    reviewerDebate: buildDebate(),
    arbitration: buildArbitration(),
    diagnostics: {
      engineVersion: "v3",
      providerName: "openai",
      modelName: "gpt-4.1",
      modelVersion: null,
      rawResponseHash: "raw",
      responseId: null,
      responseTimestamp: null,
      promptHash: "prompt",
      semanticHash: "semantic",
      legalHash: "legal",
      executionSignatureHash: null,
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "profanity",
      chunkHash: "chunk",
      findingCount: 1,
    },
  });
  const packageTwo = buildExplanationPackage({
    jobId: "job-1",
    chunkId: "chunk-1",
    pipelineVersion: "v2",
    analysisResponse: buildAnalysisResponse(),
    findings: [buildFinding()],
    reviewerDebate: buildDebate(),
    arbitration: buildArbitration(),
    diagnostics: {
      engineVersion: "v3",
      providerName: "openai",
      modelName: "gpt-4.1",
      modelVersion: null,
      rawResponseHash: "raw",
      responseId: null,
      responseTimestamp: null,
      promptHash: "prompt",
      semanticHash: "semantic",
      legalHash: "legal",
      executionSignatureHash: null,
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "profanity",
      chunkHash: "chunk",
      findingCount: 1,
    },
  });

  assert.equal(JSON.stringify(packageOne), JSON.stringify(packageTwo));
}

function testExplanationReferences(): void {
  const explanation = buildExplanationPackage({
    jobId: "job-1",
    chunkId: "chunk-1",
    pipelineVersion: "v2",
    analysisResponse: buildAnalysisResponse(),
    findings: [buildFinding()],
    reviewerDebate: buildDebate(),
    arbitration: buildArbitration(),
    diagnostics: {
      engineVersion: "v3",
      providerName: "openai",
      modelName: "gpt-4.1",
      modelVersion: null,
      rawResponseHash: "raw",
      responseId: null,
      responseTimestamp: null,
      promptHash: "prompt",
      semanticHash: "semantic",
      legalHash: "legal",
      executionSignatureHash: null,
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "profanity",
      chunkHash: "chunk",
      findingCount: 1,
    },
  });

  assert.equal(explanation.findings.length, 1);
  assert.equal(explanation.summary.explanationCompleteness > 0, true);
  assert.equal(explanation.summary.referenceCompleteness > 0, true);
  assert.equal(explanation.summary.knowledgeCompleteness > 0, true);
  assert.equal(explanation.summary.evidenceCompleteness > 0, true);
  assert.equal(explanation.summary.reasoningCompleteness > 0, true);
  assert.equal(explanation.findings[0]?.inspectionReferences.includes("arbitration"), true);
  assert.equal(explanation.reviewerDebate.opinions[0]?.selfCritique?.confidenceBefore, explanation.reviewerDebate.opinions[0]?.confidence);
  assert.equal(explanation.reviewerDebate.opinions[0]?.selfCritique?.reasonChanges.length > 0, true);
}

async function main(): Promise<void> {
  testExplanationDeterminism();
  testExplanationReferences();
  console.log("✓ V3 explanation package is deterministic and fully referenced");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
