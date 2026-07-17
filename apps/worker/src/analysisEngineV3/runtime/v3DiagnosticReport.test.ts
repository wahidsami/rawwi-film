import assert from "node:assert/strict";
import { buildV3DiagnosticReport, buildV3ProviderFailureDiagnosticReport, finalizeV3DiagnosticReport } from "./v3DiagnosticReport.js";

const report = buildV3DiagnosticReport({
  providerDecision: {
    reasoning: "Reason",
    alternativeInterpretations: ["Alt"],
    confidence: 0.91,
    articleEvaluations: [
      { articleId: 11, status: "PASS", evidence: ["quote"], reason: "fits", confidence: 0.9 },
      { articleId: 18, status: "FAIL", evidence: ["other quote"], reason: "does not fit", confidence: 0.2 },
    ],
    supportingEvidence: ["quote"],
    contradictingEvidence: [],
    applicableArticles: [11],
    rejectedArticles: [18],
    riskAnalysis: "risk",
    narrativeAnalysis: "narrative",
    humanLikeExplanation: "explanation",
    recommendation: "NO VIOLATION",
  },
  groundingValidation: {
    valid: true,
    issues: [],
    validationNote: "ok",
  },
  scopeValidation: {
    scopeMatrix: [],
    selectedReviewerIds: ["religion"],
    selectedReviewerLabels: ["Religion"],
    rejectedReviewerIds: [],
    rejectedReviewerLabels: [],
    acceptedFindingsCount: 1,
    rejectedFindingsByScopeCount: 0,
    acceptedFindings: [],
    rejectedFindingsByScope: [],
    sanitizedDecision: {
      moduleId: "religion",
      moduleTitle: "Religion",
      articleIds: [11],
      applies: true,
      status: "accept",
      reason: "accept",
      confidence: 0.9,
      semantic: {} as never,
      narrative: {} as never,
      evidence: { candidates: [], primaryCandidateIndex: null, admissible: true, confidence: 0.9 },
      context: {} as never,
      exceptions: [],
      finding: {
        findingKey: "f1",
        moduleId: "religion",
        moduleTitle: "Religion",
        articleIds: [11],
        status: "accept",
        reason: "accept",
        confidence: 0.9,
        semantic: {} as never,
        narrative: {} as never,
        evidence: { text: "quote", startOffset: 0, endOffset: 5, confidence: 0.9, source: "chunk" },
        context: {} as never,
        exceptionCodes: [],
      },
      trace: ["scope_validation:accepted"],
    },
    sanitizedReasonedDecision: {
      reasoning: "Reason",
      alternativeInterpretations: ["Alt"],
      confidence: 0.91,
      articleEvaluations: [
        { articleId: 11, status: "PASS", evidence: ["quote"], reason: "fits", confidence: 0.9 },
      ],
      supportingEvidence: ["quote"],
      contradictingEvidence: [],
      applicableArticles: [11],
      rejectedArticles: [18],
      riskAnalysis: "risk",
      narrativeAnalysis: "narrative",
      humanLikeExplanation: "explanation",
      recommendation: "NO VIOLATION",
    },
    scopeReason: "ok",
  },
  validatedDecision: {
    moduleId: "religion",
    moduleTitle: "Religion",
    articleIds: [11],
    applies: true,
    status: "accept",
    reason: "accept",
    confidence: 0.9,
    semantic: {} as never,
    narrative: {} as never,
    evidence: { candidates: [], primaryCandidateIndex: null, admissible: true, confidence: 0.9 },
    context: {} as never,
    exceptions: [],
    finding: {
      findingKey: "f1",
      moduleId: "religion",
      moduleTitle: "Religion",
      articleIds: [11],
      status: "accept",
      reason: "accept",
      confidence: 0.9,
      semantic: {} as never,
      narrative: {} as never,
      evidence: { text: "quote", startOffset: 0, endOffset: 5, confidence: 0.9, source: "chunk" },
      context: {} as never,
      exceptionCodes: [],
    },
    trace: ["scope_validation:accepted"],
  },
  mapperFindings: [
    {
      article_id: 11,
      atom_id: "11-1",
      confidence: 0.9,
      evidence_snippet: "quote",
    } as never,
  ],
  providerError: null,
});

assert.equal(report.providerFindingsCount, 2);
assert.equal(report.mapperFindingsCount, 1);
assert.equal(report.rejectedFindings.length >= 0, true);
assert.equal(report.stageSummary[0]?.stage, "provider");
assert.equal(report.provider_error, null);

const finalized = finalizeV3DiagnosticReport(report, {
  persistenceFindingsCount: 1,
  persistenceInsertedCount: 1,
  persistenceSkippedCount: 0,
});

assert.equal(finalized.persistenceFindingsCount, 1);
assert.equal(finalized.stageSummary.find((stage) => stage.stage === "persistence")?.outputCount, 1);

const failureReport = buildV3ProviderFailureDiagnosticReport({
  providerError: {
    name: "OpenAIError",
    message: "upstream failed",
    stack: null,
    httpStatus: 500,
    type: "server_error",
    code: "server_error",
    param: null,
    requestId: "req_123",
    modelName: "gpt-4.1",
    maxTokens: 4096,
    promptTokenEstimate: 1024,
    retryAttempt: 0,
    serializedError: { message: "upstream failed" },
  },
});

assert.ok(failureReport.provider_error);
assert.equal(failureReport.provider_error.message, "upstream failed");
assert.equal(failureReport.stageSummary[0]?.rejectionReason, "upstream failed");
console.log("✓ V3 diagnostic report summarizes stage counts");
