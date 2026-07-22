/**
 * Regression tests for the V4 provenance report generator.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/provenance/findingProvenanceReport.test.ts
 */
import { strict as assert } from "node:assert";

import { buildProvenanceReport, renderProvenanceReportMarkdown, type ProvenanceReportInput } from "./findingProvenanceReport.js";

function createPageReferences(text: string) {
  return Object.freeze([
    Object.freeze({
      pageNumber: 1,
      startOffsetPage: 0,
      endOffsetPage: text.length,
    }),
  ]);
}

function createEvidence() {
  return Object.freeze({
    id: "evidence-1",
    spanId: "evidence-1",
    startOffset: 10,
    endOffset: 18,
    text: "الناس تعر",
    sceneId: "scene-1",
    eventId: "event-1",
    speaker: "فهد",
    target: null,
    page: 1,
    scene: "Scene one",
    byteStartOffset: 10,
    byteEndOffset: 18,
    rawText: "الناس تعر",
    normalizedText: "الناس تعر",
    eventType: "Dialogue",
    participants: Object.freeze(["فهد"]),
    confidence: 1,
    sourceType: "Dialogue",
    lineId: "line-1",
    sentenceIndex: 0,
    pageReferences: createPageReferences("الناس تعر"),
    conceptIds: Object.freeze([]),
    rationale: Object.freeze(["Evidence selected for provenance report testing."]),
    grounding: Object.freeze({
      sentenceId: "sentence-1",
      lineId: "line-1",
      page: 1,
      startOffset: 10,
      endOffset: 18,
      byteStartOffset: 10,
      byteEndOffset: 18,
      matchedText: "الناس تعر",
      method: "exact" as const,
      pageReferences: createPageReferences("الناس تعر"),
    }),
  });
}

function buildInput(): ProvenanceReportInput {
  const evidence = createEvidence();

  const concept = Object.freeze({
    id: "concept-1",
    evidenceId: "evidence-1",
    evidenceSpanId: "evidence-1",
    conceptId: "concept-1",
    conceptName: "Profanity",
    conceptCategory: "profanity",
    confidence: 0.9,
    severity: "high",
    targets: Object.freeze(["people"]),
    participants: Object.freeze(["فهد"]),
    reason: "The evidence contains a profane insult.",
    supportingEvidenceIds: Object.freeze(["evidence-1"]),
    evidenceSpanIds: Object.freeze(["evidence-1"]),
    knowledgeDomains: Object.freeze(["profanity"]),
    label: "Profanity",
    rationale: Object.freeze(["Concept derived from the grounded evidence."]),
  });

  const legalDecision = Object.freeze({
    id: "decision-1",
    conceptId: "concept-1",
    candidateArticles: Object.freeze([
      Object.freeze({
        articleId: 11,
        titleAr: "الألفاظ النابية",
        matchedKnowledgeDomains: Object.freeze(["profanity"]),
        matchedConceptIds: Object.freeze(["concept-1"]),
        evidenceSpanIds: Object.freeze(["evidence-1"]),
        score: 0.99,
        rationale: Object.freeze(["Article 11 selected from Academy mapping."]),
      }),
    ]),
    primaryArticle: Object.freeze({
      articleId: 11,
      titleAr: "الألفاظ النابية",
      matchedKnowledgeDomains: Object.freeze(["profanity"]),
      matchedConceptIds: Object.freeze(["concept-1"]),
      evidenceSpanIds: Object.freeze(["evidence-1"]),
      score: 0.99,
      rationale: Object.freeze(["Article 11 selected from Academy mapping."]),
    }),
    secondaryArticles: Object.freeze([]),
    mappingReason: "Deterministic mapping for profanity.",
    mappingConfidence: 0.99,
    knowledgeSource: "academy",
  });

  const explanation = Object.freeze({
    id: "explanation-1",
    legalDecisionId: "decision-1",
    conceptId: "concept-1",
    evidenceId: "evidence-1",
    title: "Explanation 1",
    summary: "The evidence is a direct profanity grounded in the same span.",
    reasoning: Object.freeze(["Evidence, concept, and article are aligned."]),
    recommendedAction: "Delete",
    confidence: 0.88,
  });

  const verifiedFinding = Object.freeze({
    findingId: "finding-1",
    evidenceId: "evidence-1",
    conceptId: "concept-1",
    legalDecisionId: "decision-1",
    explanationId: "explanation-1",
    verificationResult: "pass",
    verificationReasons: Object.freeze([]),
    overallConfidence: 0.91,
  });

  const provenance = Object.freeze({
    sceneId: "scene-1",
    provenance: Object.freeze([
      Object.freeze({
        findingId: "finding-1",
        sceneId: "scene-1",
        evidenceIds: Object.freeze(["evidence-1"]),
        conceptIds: Object.freeze(["concept-1"]),
        legalDecisionIds: Object.freeze(["decision-1"]),
        explanationIds: Object.freeze(["explanation-1"]),
        parentNodeIds: Object.freeze(["evidence:evidence-1", "concept:concept-1", "legalDecision:decision-1", "explanation:explanation-1"]),
        childNodeIds: Object.freeze([]),
        executionOrder: Object.freeze(["scene:scene-1", "evidence:evidence-1", "concept:concept-1", "legalDecision:decision-1", "explanation:explanation-1", "verifiedFinding:finding-1"]),
        confidencePath: Object.freeze([1, 0.9, 0.99, 0.88, 0.91]),
        timestamps: Object.freeze(["scene-1:000:scene", "scene-1:001:evidence", "scene-1:002:concept", "scene-1:003:legalDecision", "scene-1:004:explanation", "scene-1:005:verifiedFinding"]),
        graphNodeIds: Object.freeze(["scene:scene-1", "evidence:evidence-1", "concept:concept-1", "legalDecision:decision-1", "explanation:explanation-1", "verifiedFinding:finding-1"]),
      }),
    ]),
    graph: Object.freeze({ sceneId: "scene-1", nodes: Object.freeze([]), edges: Object.freeze([]) }),
    report: Object.freeze({
      sceneId: "scene-1",
      totalFindings: 1,
      replayableFindingIds: Object.freeze(["finding-1"]),
      brokenLinkCount: 0,
      brokenChainCount: 0,
      graphNodeCount: 0,
      graphEdgeCount: 0,
      replayableChains: Object.freeze([Object.freeze({ findingId: "finding-1", path: Object.freeze([]) })]),
    }),
    executionTimeMs: 0,
  });

  const trace = Object.freeze({
    sceneId: "scene-1",
    sceneSummary: "Scene one",
    evidence: Object.freeze([evidence]),
    evidenceCollection: Object.freeze({
      sceneId: "scene-1",
      evidence: Object.freeze([evidence]),
      primaryEvidenceId: "evidence-1",
      dedupDecisions: Object.freeze([]),
      grounding: Object.freeze({
        totalCandidates: 1,
        groundedCount: 1,
        unmatchedCount: 0,
      }),
      executionTimeMs: 0,
    }),
    conceptCollection: Object.freeze({
      sceneId: "scene-1",
      evidenceCollectionId: "evidence-collection-1",
      concepts: Object.freeze([concept]),
      dedupDecisions: Object.freeze([]),
      normalization: Object.freeze([]),
      classificationOutput: Object.freeze(["Profanity"]),
      confidence: 0.9,
      executionTimeMs: 0,
    }),
    legalDecisionCollection: Object.freeze({
      sceneId: "scene-1",
      conceptIds: Object.freeze(["concept-1"]),
      decisions: Object.freeze([legalDecision]),
      candidateArticles: Object.freeze([legalDecision.primaryArticle]),
      rankedCandidateArticles: Object.freeze([legalDecision.primaryArticle]),
      primaryArticle: legalDecision.primaryArticle,
      secondaryArticles: Object.freeze([]),
      supportingArticles: Object.freeze([]),
      knowledgeSource: "academy",
      confidence: 0.99,
      executionTimeMs: 0,
    }),
    explanationCollection: Object.freeze({
      sceneId: "scene-1",
      explanations: Object.freeze([explanation]),
      primaryExplanationId: "explanation-1",
      primaryExplanation: explanation,
      prompt: "prompt",
      response: "response",
      validationResult: Object.freeze({ status: "pass", rejectedReasons: Object.freeze([]) }),
      confidence: 0.88,
      executionTimeMs: 0,
    }),
    verifiedFindingCollection: Object.freeze({
      sceneId: "scene-1",
      verifiedFindings: Object.freeze([verifiedFinding]),
      primaryVerifiedFindingId: "finding-1",
      primaryVerifiedFinding: verifiedFinding,
      ruleEvaluations: Object.freeze([]),
      report: Object.freeze({
        sceneId: "scene-1",
        totalFindings: 1,
        passCount: 1,
        rejectCount: 0,
        needsReviewCount: 0,
        duplicateMergedCount: 0,
        overallStatus: "pass",
        overallConfidence: 0.91,
        ruleEvaluations: Object.freeze([]),
        rejectionReasons: Object.freeze([]),
      }),
      confidence: 0.91,
      executionTimeMs: 0,
    }),
    decisionProvenanceCollection: provenance,
    concepts: Object.freeze([{ conceptId: "concept-1", label: "Profanity", knowledgeDomains: Object.freeze(["profanity"]), evidenceSpanIds: Object.freeze(["evidence-1"]), confidence: 0.9, rationale: Object.freeze([]) }]),
    knowledgeDomains: Object.freeze(["profanity"]),
    candidateArticles: Object.freeze([legalDecision.primaryArticle]),
    rankedArticles: Object.freeze([legalDecision.primaryArticle]),
    selectedArticle: legalDecision.primaryArticle,
    explanation: explanation,
    judgeResult: Object.freeze({
      status: "pass",
      quoteExists: true,
      explanationReferencesQuote: true,
      articleMatchesConcept: true,
      sceneSummarySupportsExplanation: true,
      explanationMentionsAnotherFinding: false,
      explanationInventsFacts: false,
      rejectionReasons: Object.freeze([]),
    }),
    findingTruth: null,
    verificationSummary: null,
    verificationTrail: Object.freeze([]),
    semanticSceneModel: null,
    semanticSceneResponse: null,
    timing: Object.freeze({
      totalMs: 6,
      nodeTimings: Object.freeze([]),
    }),
    nodeExecutionOrder: Object.freeze(["understand_scene", "interpret_scene", "candidate_evidence", "concept_classification", "legal_mapping", "explanation", "quality_judge", "finalize"]),
    steps: Object.freeze([]),
  });

  const analysisFindingRow = Object.freeze({
    id: "db-row-1",
    job_id: "job-1",
    created_at: "2026-07-22T00:00:02.000Z",
    article_id: 11,
    atom_id: "11-1",
    severity: "high",
    confidence: 0.91,
    title_ar: "الألفاظ النابية",
    description_ar: "The evidence is a direct profanity grounded in the same span.",
    evidence_snippet: "الناس تعر",
    start_offset_global: 10,
    end_offset_global: 18,
    line_number_chunk: 3,
    location: Object.freeze({
      v3: Object.freeze({
        canonical_finding_id: "finding-1",
        evidence_id: "evidence-1",
      }),
    }),
    canonical_finding_id: "finding-1",
    lineage_id: "line-1",
    review_status: "violation",
  });

  const analysisReport = Object.freeze({
    id: "report-1",
    job_id: "job-1",
    summary_json: Object.freeze({
      generated_at: "2026-07-22T00:00:03.000Z",
    }),
    created_at: "2026-07-22T00:00:03.000Z",
  });

  return Object.freeze({
    jobId: "job-1",
    analysisReport,
    analysisFindings: Object.freeze([analysisFindingRow]),
    chunkRuns: Object.freeze([
      Object.freeze({
        jobId: "job-1",
        runKey: "run-1",
        truthLayerMeta: Object.freeze({
          runtime_orchestrator: Object.freeze({
            report: Object.freeze({
              analysisFindings: Object.freeze([Object.freeze({
                canonical_finding_id: "finding-1",
                lineage_id: "line-1",
                id: "finding-1",
                article_id: 11,
                atom_id: "11-1",
                severity: "high",
                confidence: 0.91,
                title_ar: "الألفاظ النابية",
                description_ar: "The evidence is a direct profanity grounded in the same span.",
                evidence_snippet: "الناس تعر",
                start_offset_global: 10,
                end_offset_global: 18,
                primary_article_id: 11,
                primary_policy_atom_id: "11-1",
              })]),
            }),
            provenance,
            trace,
            runtime: Object.freeze({ executionTimeMs: 123 }),
          }),
        }),
      }),
    ]),
  });
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function runTests() {
  const input = buildInput();
  const report = buildProvenanceReport(input);
  const sameReport = buildProvenanceReport(input);
  const expectedTruthId = report.findings[0]?.stages[0]?.truthId ?? null;

  assert.equal(report.jobId, "job-1");
  assert.equal(report.reportId, "report-1");
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]?.findingId, "finding-1");
  assert.equal(report.findings[0]?.truthId, expectedTruthId);
  assert.equal(report.findings[0]?.stages.length, 7);
  assert.equal(report.findings[0]?.stages[0]?.stage, "Evidence");
  assert.equal(report.findings[0]?.stages[0]?.objectIdentity, "evidence-1");
  assert.equal(report.findings[0]?.stages[1]?.stage, "Concept");
  assert.equal(report.findings[0]?.stages[2]?.stage, "Article");
  assert.equal(report.findings[0]?.stages[3]?.stage, "Explanation");
  assert.equal(report.findings[0]?.stages[4]?.stage, "Judge");
  assert.equal(report.findings[0]?.stages[5]?.stage, "DB row");
  assert.equal(report.findings[0]?.stages[6]?.stage, "UI");
  assert.equal(report.markdown.includes("# V4 Provenance Report"), true);
  assert.equal(report.markdown.includes("## Finding finding-1"), true);
  assert.equal(report.markdown.includes("Results.tsx"), true);
  assert.equal(report.markdown.includes("analysis_findings.id=db-row-1"), true);
  assert.equal(normalizeMarkdown(report.markdown), normalizeMarkdown(sameReport.markdown));
  assert.equal(normalizeMarkdown(report.markdown), normalizeMarkdown(renderProvenanceReportMarkdown(report)));
  console.log("✓ V4 provenance report is deterministic and preserves the full evidence → UI chain");
}

runTests();
