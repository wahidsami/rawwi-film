/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/inspection/inspection.test.ts
 */
import { strict as assert } from "node:assert";
import { createV3InspectionRecorder } from "./inspectionRecorder.js";
import { buildV3InspectionTimeline, groupV3InspectionRecords, sortV3InspectionRecords } from "./inspectionLoader.js";
import { renderV3InspectionTimeline } from "./inspectionRenderer.js";
import type { V3InspectionRecord } from "./inspectionTypes.js";
import {
  buildV3ArbitrationInspectionRecord,
  buildV3AggregationInspectionRecord,
  buildV3FinalReportInspectionRecord,
  buildV3LegalReviewInspectionRecord,
  buildV3KnowledgeRegistryInspectionRecord,
  buildV3KnowledgeRankingInspectionRecord,
  buildV3SemanticGenerationInspectionRecord,
  buildV3ReviewerDebateInspectionRecord,
} from "./inspectionStageBuilders.js";

function buildRecord(input: Partial<V3InspectionRecord> & Pick<V3InspectionRecord, "findingKey" | "stageOrder" | "stageName" | "jobId" | "chunkId" | "payloadJson" | "createdAt">): V3InspectionRecord {
  return Object.freeze({
    id: input.id,
    jobId: input.jobId,
    chunkId: input.chunkId,
    findingKey: input.findingKey,
    stageOrder: input.stageOrder,
    stageName: input.stageName,
    payloadJson: Object.freeze(input.payloadJson),
    createdAt: input.createdAt,
  });
}

async function testRecorderDisabledIsNoOp(): Promise<void> {
  let called = 0;
  const recorder = createV3InspectionRecorder({
    enabled: false,
    persist: async () => {
      called += 1;
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });

  await recorder.recordStages([
    {
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-1",
      stageOrder: 1,
      stageName: "semantic_generation",
      payloadJson: { ok: true },
    },
  ]);

  assert.equal(called, 0);
}

async function testRecorderEnabledPersistsRecords(): Promise<void> {
  let persisted: readonly V3InspectionRecord[] = [];
  const recorder = createV3InspectionRecorder({
    enabled: true,
    persist: async (records) => {
      persisted = records;
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });

  await recorder.recordStage({
    jobId: "job-1",
    chunkId: null,
    findingKey: "finding-1",
    stageOrder: 2,
    stageName: "knowledge_matching",
    payloadJson: { nested: { value: 1 } },
  });

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(persisted[0]?.stageName, "knowledge_matching");
}

function testOrderingAndRendering(): void {
  const records = [
    buildRecord({
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-b",
      stageOrder: 2,
      stageName: "knowledge_matching",
      payloadJson: { b: 2 },
      createdAt: "2026-01-01T00:00:02.000Z",
    }),
    buildRecord({
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-a",
      stageOrder: 1,
      stageName: "semantic_generation",
      payloadJson: { a: 1 },
      createdAt: "2026-01-01T00:00:01.000Z",
    }),
  ] as const;

  const ordered = sortV3InspectionRecords(records);
  assert.equal(ordered[0]?.findingKey, "finding-a");
  assert.equal(ordered[1]?.findingKey, "finding-b");

  const timeline = buildV3InspectionTimeline("job-1", records);
  assert.equal(timeline.records.length, 2);
  assert.equal(groupV3InspectionRecords(records).length, 2);

  const rendered = renderV3InspectionTimeline(timeline);
  assert(rendered.includes("V3 Inspection Timeline"));
  assert(rendered.includes("finding-a"));
  assert(rendered.includes("semantic_generation"));
}

async function testStageBuildersHandleZeroCounts(): Promise<void> {
  const semanticRecord = buildV3SemanticGenerationInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      findingKey: "job:job-zero:chunk:chunk-zero",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    provider: "openai",
    model: "gpt-4.1",
    promptHash: "prompt",
    semanticHash: "semantic",
    semanticOutput: {},
    semanticConfidence: 0,
    concepts: [],
    entities: [],
    sceneInformation: {},
    candidateCount: 0,
    candidates: [],
    stageTimings: [],
  });

  const legalRecord = buildV3LegalReviewInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      findingKey: "job:job-zero:chunk:chunk-zero",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    moduleId: "profanity",
    moduleTitle: "Profanity",
    status: "reject",
    reason: "no findings",
    confidence: 0,
    articleIds: [],
    finding: null,
    exceptions: [],
    trace: [],
    candidateCount: 0,
    acceptedCount: 0,
    rejectedCount: 1,
    needsReviewCount: 0,
  });

  const aggregationRecord = buildV3AggregationInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: null,
      findingKey: "job:job-zero:summary",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    canonicalFindings: [],
    findingsCount: 0,
    reportHintsCount: 0,
    severityCounts: { low: 0, medium: 0, high: 0, critical: 0 },
    reportOverview: null,
  });

  const finalReportRecord = buildV3FinalReportInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: null,
      findingKey: "job:job-zero:summary",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    finalFindingCount: 0,
    observationCount: 0,
    reportStatus: "completed",
    jobStatus: "completed",
    reportSummary: {},
    reportHtml: "<html />",
  });

  const knowledgeRegistryRecord = buildV3KnowledgeRegistryInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      findingKey: "job:job-zero:chunk:chunk-zero",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    registry: {
      rootDir: "/tmp/reviewerKnowledge",
      entries: [],
      validation: {
        valid: true,
        issues: [],
        hash: "registry-validation",
      },
      statistics: {
        totalCount: 0,
        kindCounts: {},
        sourceCounts: {},
        domainCounts: {},
        traceabilityCoverage: 100,
        explainabilityCoverage: 100,
        duplicateIdCount: 0,
        missingMetadataCount: 0,
        missingReferenceCount: 0,
        circularReferenceCount: 0,
        orphanCount: 0,
        coveragePercent: 100,
        productionReadiness: 100,
        hash: "registry-statistics",
      },
      hash: "registry-hash",
      list: () => [],
      get: () => null,
      listByKind: () => [],
    },
  });

  const knowledgeRankingRecord = buildV3KnowledgeRankingInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      findingKey: "job:job-zero:chunk:chunk-zero",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    ranking: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      analysisEngine: "v3",
      pipelineVersion: "v2",
      querySummary: {
        subjectModuleId: "v3_11_profanity",
        subjectModuleTitle: "الألفاظ النابية",
        conceptIds: [],
        articleIds: [],
        semanticConfidence: 0,
        evidenceConfidence: 0,
        queryTerms: [],
      },
      domainScores: [],
      conceptScores: [],
      lessonScores: [],
      blueprintScores: [],
      patternScores: [],
      relationshipScores: [],
      articleScores: [],
      selectedRegistryKeys: [],
      knowledgeConfidence: 0,
      retrievalCoverage: 0,
      totalRegistryEntries: 0,
    },
  });

  assert.equal(semanticRecord.payloadJson.semantic_candidate_count, 0);
  assert.equal((semanticRecord.payloadJson.semantic_candidates as readonly unknown[]).length, 0);
  assert.equal(legalRecord.payloadJson.accepted_count, 0);
  assert.equal(legalRecord.payloadJson.rejected_count, 1);
  assert.equal(aggregationRecord.payloadJson.clustered_findings, 0);
  assert.equal(aggregationRecord.payloadJson.report_findings, 0);
  assert.equal(finalReportRecord.payloadJson.final_finding_count, 0);
  assert.equal(finalReportRecord.payloadJson.observation_count, 0);
  assert.equal(knowledgeRegistryRecord.payloadJson.registry_total_count, 0);
  assert.equal(knowledgeRegistryRecord.payloadJson.validation_valid, true);
  const knowledgeRankingPayload = knowledgeRankingRecord.payloadJson as Record<string, unknown>;
  assert.equal(knowledgeRankingPayload.knowledge_confidence, 0);
  assert.equal((knowledgeRankingPayload.domain_scores as readonly unknown[]).length, 0);

  const recorder = createV3InspectionRecorder({
    enabled: true,
    persist: async (records) => {
      assert.equal(records.length, 6);
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });

  await recorder.recordStages([semanticRecord, legalRecord, aggregationRecord, finalReportRecord, knowledgeRegistryRecord, knowledgeRankingRecord]);
}

function testReviewerDebateStageBuilder(): void {
  const debateRecord = buildV3ReviewerDebateInspectionRecord({
    base: {
      jobId: "job-debate",
      chunkId: "chunk-debate",
      findingKey: "job:job-debate:chunk:chunk-debate",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    debate: {
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
        confidence: 0.9,
        articleIds: [4],
        reason: "supported",
      },
      reviewerCount: 2,
      executionOrder: ["Profanity Reviewer", "General Reviewer"],
      reviewerDurations: [
        { reviewerId: "profanity", reviewerName: "Profanity Reviewer", durationMs: 0 },
        { reviewerId: "general_reviewer", reviewerName: "General Reviewer", durationMs: 0 },
      ],
      opinions: [
        {
          reviewerId: "profanity",
          reviewerName: "Profanity Reviewer",
          moduleId: "profanity",
          moduleTitle: "Profanity",
          applicable: true,
          status: "accept",
          confidence: 0.9,
          reasoning: "supported",
          supportingEvidence: ["quote"],
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
          durationMs: 0,
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
          supportingEvidence: ["quote"],
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
          durationMs: 0,
        },
      ],
      opinionSummaries: [
        {
          reviewerId: "profanity",
          reviewerName: "Profanity Reviewer",
          status: "accept",
          confidence: 0.9,
          applicable: true,
          suggestedArticles: [4],
          rejectedArticles: [],
          riskLevel: "critical",
          needsHumanReview: false,
        },
        {
          reviewerId: "general_reviewer",
          reviewerName: "General Reviewer",
          status: "accept",
          confidence: 0.9,
          applicable: true,
          suggestedArticles: [4],
          rejectedArticles: [],
          riskLevel: "critical",
          needsHumanReview: false,
        },
      ],
      agreementMatrix: [
        {
          leftReviewerId: "profanity",
          rightReviewerId: "general_reviewer",
          sameStatus: true,
          articleOverlap: 1,
          knowledgeOverlap: 1,
          evidenceOverlap: 1,
          confidenceDelta: 0,
          agreementScore: 1,
          disagreementScore: 0,
        },
      ],
      disagreementMatrix: [],
      highestConfidenceReviewer: "Profanity Reviewer",
      lowestConfidenceReviewer: "Profanity Reviewer",
      conflictingArticles: [],
      supportingEvidenceOverlap: ["quote"],
      knowledgeOverlap: ["lesson-1"],
      confidenceDistribution: {
        minimum: 0.9,
        maximum: 0.9,
        average: 0.9,
        median: 0.9,
        spread: 0,
        buckets: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 2,
        },
      },
      consensusScore: 1,
      metrics: {
        agreement: 1,
        disagreement: 0,
        averageConfidence: 0.9,
        participation: 1,
        articleOverlap: 1,
        knowledgeOverlap: 1,
        evidenceOverlap: 1,
        consensusPercentage: 1,
      },
    },
  });

  assert.equal(debateRecord.stageName, "reviewer_debate");
  assert.equal(debateRecord.stageOrder, 10);
  assert.equal((debateRecord.payloadJson as Record<string, unknown>).reviewer_count, 2);
}

function testArbitrationStageBuilder(): void {
  const arbitrationRecord = buildV3ArbitrationInspectionRecord({
    base: {
      jobId: "job-arbitration",
      chunkId: "chunk-arbitration",
      findingKey: "job:job-arbitration:chunk:chunk-arbitration",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    arbitration: {
      debate: {
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
          confidence: 0.9,
          articleIds: [4],
          reason: "supported",
        },
        reviewerCount: 2,
        executionOrder: ["Profanity Reviewer", "General Reviewer"],
        reviewerDurations: [],
        opinions: [],
        opinionSummaries: [],
        agreementMatrix: [],
        disagreementMatrix: [],
        highestConfidenceReviewer: "Profanity Reviewer",
        lowestConfidenceReviewer: "Profanity Reviewer",
        conflictingArticles: [],
        supportingEvidenceOverlap: [],
        knowledgeOverlap: [],
        confidenceDistribution: {
          minimum: 0.9,
          maximum: 0.9,
          average: 0.9,
          median: 0.9,
          spread: 0,
          buckets: {
            low: 0,
            medium: 0,
            high: 0,
            critical: 1,
          },
        },
        consensusScore: 1,
        metrics: {
          agreement: 1,
          disagreement: 0,
          averageConfidence: 0.9,
          participation: 1,
          articleOverlap: 1,
          knowledgeOverlap: 1,
          evidenceOverlap: 1,
          consensusPercentage: 1,
        },
      } as never,
      winningReviewer: {
        reviewerId: "profanity",
        reviewerName: "Profanity Reviewer",
        status: "accept",
        confidence: 0.9,
      },
      winningOpinion: {
        reviewerId: "profanity",
        reviewerName: "Profanity Reviewer",
        moduleId: "profanity",
        moduleTitle: "Profanity",
        applicable: true,
        status: "accept",
        confidence: 0.9,
        reasoning: "supported",
        supportingEvidence: ["quote"],
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
        durationMs: 0,
      },
      winningOpinionIndex: 0,
      winningReason: "supported",
      winningEvidence: ["quote"],
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
      rejectedReviewers: [],
      rejectedReasons: [],
      confidence: 0.9,
      confidenceAdjustment: 1,
      consensusScore: 1,
      agreementMatrix: [],
      disagreementMatrix: [],
      confidenceDistribution: {
        minimum: 0.9,
        maximum: 0.9,
        average: 0.9,
        median: 0.9,
        spread: 0,
        buckets: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 1,
        },
      },
      metrics: {
        agreement: 1,
        disagreement: 0,
        averageConfidence: 0.9,
        participation: 1,
        articleOverlap: 1,
        knowledgeOverlap: 1,
        evidenceOverlap: 1,
        consensusPercentage: 1,
      },
      conflicts: [],
      needsHumanReview: false,
      escalationRecommendation: "No escalation required; arbitration consensus is stable.",
      decisionExplanation: "Winning reviewer: Profanity Reviewer | Winning status: accept | Winning article: 4 | Consensus score: 1.000000 | Confidence adjustment: 1.000000 | Final confidence: 0.900000 | Escalation: not required",
      decisionDurationMs: 0,
      finalDecisionStatus: "accept",
    },
  });

  assert.equal(arbitrationRecord.stageName, "arbitration");
  assert.equal(arbitrationRecord.stageOrder, 11);
  assert.equal((arbitrationRecord.payloadJson as Record<string, unknown>).winning_article, 4);
}

async function main(): Promise<void> {
  await testRecorderDisabledIsNoOp();
  await testRecorderEnabledPersistsRecords();
  testOrderingAndRendering();
  await testStageBuildersHandleZeroCounts();
  testReviewerDebateStageBuilder();
  testArbitrationStageBuilder();
  console.log("✓ V3 inspection recorder, loader, and renderer behave correctly");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
