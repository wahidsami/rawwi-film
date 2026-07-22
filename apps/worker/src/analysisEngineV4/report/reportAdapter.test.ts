/**
 * Regression tests for the V4 report adapter.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/report/reportAdapter.test.ts
 */
import { strict as assert } from "node:assert";

import type { DecisionProvenanceCollection } from "../provenance/decisionProvenanceTypes.js";
import type { VerifiedFindingCollection } from "../judge/qualityJudgeTypes.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";
import { buildV4ReportAdapter } from "./reportAdapter.js";
import { serializeReportAdapterResult } from "./reportSerializer.js";

function buildFinding(overrides: Partial<V3RuntimeFinding>): V3RuntimeFinding {
  return Object.freeze({
    source: "v4",
    article_id: 4,
    atom_id: "4-1",
    canonical_atom: "ART4_ATOM_4-1",
    canonical_atoms: ["ART4_ATOM_4-1"],
    intensity: 3,
    context_impact: 2,
    legal_sensitivity: 2,
    audience_risk: 2,
    title_ar: "الألفاظ النابية",
    description_ar: "يا كلب",
    severity: "high",
    confidence: 0.93,
    is_interpretive: false,
    depiction_type: "mention",
    speaker_role: "narrator",
    narrative_consequence: "neutralized",
    context_window_id: "scene-report",
    context_confidence: 0.88,
    lexical_confidence: 0.91,
    policy_confidence: 0.89,
    rationale_ar: "Grounded profanity evidence.",
    final_ruling: "violation",
    detection_pass: "v4",
    lineage_id: "finding-report-1",
    parent_lineage_id: null,
    canonical_hash: "canonical-1",
    evidence_hash: "evidence-1",
    evidence_snippet: "يا كلب",
    location: Object.freeze({
      start_offset: 12,
      end_offset: 18,
      start_line: 1,
      end_line: 1,
      v3: Object.freeze({ report: true }),
    }) as V3RuntimeFinding["location"],
    ...overrides,
  }) as V3RuntimeFinding;
}

function buildVerifiedFindingCollection(): VerifiedFindingCollection {
  return Object.freeze({
    sceneId: "scene-report",
    verifiedFindings: Object.freeze([
      Object.freeze({
        findingId: "finding-report-1",
        evidenceId: "evidence-1",
        conceptId: "profanity",
        legalDecisionId: "decision-1",
        explanationId: "explanation-1",
        verificationResult: "pass",
        verificationReasons: Object.freeze(["evidence_exists"]),
        overallConfidence: 0.93,
      }),
    ]),
    primaryVerifiedFindingId: "finding-report-1",
    primaryVerifiedFinding: Object.freeze({
      findingId: "finding-report-1",
      evidenceId: "evidence-1",
      conceptId: "profanity",
      legalDecisionId: "decision-1",
      explanationId: "explanation-1",
      verificationResult: "pass",
      verificationReasons: Object.freeze(["evidence_exists"]),
      overallConfidence: 0.93,
    }),
    ruleEvaluations: Object.freeze([]),
    report: Object.freeze({
      sceneId: "scene-report",
      totalFindings: 1,
      passCount: 1,
      rejectCount: 0,
      needsReviewCount: 0,
      duplicateMergedCount: 0,
      overallStatus: "pass",
      overallConfidence: 0.93,
      ruleEvaluations: Object.freeze([]),
      rejectionReasons: Object.freeze([]),
    }),
    confidence: 0.93,
    executionTimeMs: 0,
  }) as VerifiedFindingCollection;
}

function buildDecisionProvenanceCollection(): DecisionProvenanceCollection {
  return Object.freeze({
    sceneId: "scene-report",
    provenance: Object.freeze([]),
    graph: Object.freeze({
      sceneId: "scene-report",
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
    }),
    report: Object.freeze({
      sceneId: "scene-report",
      totalFindings: 1,
      replayableFindingIds: Object.freeze(["finding-report-1"]),
      brokenLinkCount: 0,
      brokenChainCount: 0,
      graphNodeCount: 0,
      graphEdgeCount: 0,
      replayableChains: Object.freeze([]),
    }),
    executionTimeMs: 0,
  }) as DecisionProvenanceCollection;
}

function testReportAdapterBuildsDeterministicBundle(): void {
  const originatingEvidence = Object.freeze({
    text: "يا كلب",
    startOffset: 12,
    endOffset: 18,
  });
  const findings = Object.freeze([buildFinding({
    start_offset_global: originatingEvidence.startOffset,
    end_offset_global: originatingEvidence.endOffset,
    location: Object.freeze({
      start_offset: originatingEvidence.startOffset,
      end_offset: originatingEvidence.endOffset,
      start_line: 1,
      end_line: 1,
      v3: Object.freeze({ report: true }),
    }) as V3RuntimeFinding["location"],
  }), buildFinding({
    article_id: 11,
    atom_id: "11-2",
    canonical_atom: "ART11_ATOM_11-2",
    title_ar: "الإساءة",
    description_ar: "سابقة مختلفة",
    severity: "medium",
    confidence: 0.81,
    lineage_id: "finding-report-2",
    evidence_hash: "evidence-2",
    evidence_snippet: "يا حمار",
  })]);

  const verifiedFindingCollection = buildVerifiedFindingCollection();
  const decisionProvenanceCollection = buildDecisionProvenanceCollection();
  const bundle = buildV4ReportAdapter({
    sceneId: "scene-report",
    jobId: "job-report",
    scriptId: "script-report",
    versionId: "version-report",
    chunkId: "chunk-report",
    findings,
    verifiedFindingCollection,
    decisionProvenanceCollection,
  });
  const second = buildV4ReportAdapter({
    sceneId: "scene-report",
    jobId: "job-report",
    scriptId: "script-report",
    versionId: "version-report",
    chunkId: "chunk-report",
    findings,
    verifiedFindingCollection,
    decisionProvenanceCollection,
  });

  assert.equal(bundle.analysisFindings.length, 2);
  assert.equal(bundle.analysisFindings[0]?.evidence_snippet, originatingEvidence.text);
  assert.equal(bundle.analysisFindings[0]?.start_offset_global, originatingEvidence.startOffset);
  assert.equal(bundle.analysisFindings[0]?.end_offset_global, originatingEvidence.endOffset);
  assert.equal(bundle.reportDocument.analysisFindings[0]?.evidence_snippet, originatingEvidence.text);
  assert.equal(bundle.reportDocument.analysisFindings[0]?.start_offset_global, originatingEvidence.startOffset);
  assert.equal(bundle.reportDocument.analysisFindings[0]?.end_offset_global, originatingEvidence.endOffset);
  assert.equal(bundle.analysisReport.findingsCount, 2);
  assert.equal(bundle.analysisReport.severityCounts.high, 1);
  assert.equal(bundle.analysisReport.severityCounts.medium, 1);
  assert.equal((bundle.truthLayerMeta.report_adapter as Readonly<Record<string, unknown>>).findings_count, 2);
  assert.equal(bundle.reportDocument.decisionProvenanceReport?.totalFindings, 1);
  assert.equal(serializeReportAdapterResult(bundle), serializeReportAdapterResult(second));
  assert.deepStrictEqual(bundle, second);
}

function main(): void {
  testReportAdapterBuildsDeterministicBundle();
  console.log("✓ report adapter builds deterministic analysis/report bundles");
  console.log("\nAll V4 report adapter tests passed.");
}

main();
