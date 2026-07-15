import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type { ExplanationCompletenessScores, ExplanationEngineInput, ExplanationFinding, ExplanationKnowledgeBundle, ExplanationPackage, ExplanationReviewerOpinion } from "./explanationTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return Object.freeze(result.sort((left, right) => normalizeText(left).localeCompare(normalizeText(right))));
}

function confidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return confidence(values.reduce((sum, value) => sum + confidence(value), 0) / values.length);
}

function buildKnowledgeBundle(source: {
  lessons: readonly string[];
  blueprints: readonly string[];
  patterns: readonly string[];
  relationships: readonly string[];
  cases: readonly string[];
  precedents: readonly string[];
}): ExplanationKnowledgeBundle {
  return Object.freeze({
    lessons: uniqueStrings(source.lessons),
    blueprints: uniqueStrings(source.blueprints),
    patterns: uniqueStrings(source.patterns),
    relationships: uniqueStrings(source.relationships),
    cases: uniqueStrings(source.cases),
    precedents: uniqueStrings(source.precedents),
  });
}

function semanticReasoning(response: AnalysisResponse): ExplanationFinding["semanticReasoning"] {
  return Object.freeze({
    semanticMeaning: response.semantic.semanticMeaning ?? "unknown",
    narrativeIntent: response.semantic.narrativeIntent ?? response.narrative.narrativeIntent ?? "unknown",
    riskContext: response.semantic.riskContext ?? "unknown",
    conversationRole: response.semantic.conversationRole ?? "unknown",
    sceneRole: response.semantic.sceneRole ?? "unknown",
    speaker: response.semantic.speaker ?? response.narrative.speaker ?? null,
    listener: response.semantic.listener ?? response.narrative.listener ?? null,
    target: response.semantic.target ?? response.narrative.target ?? null,
    victim: response.semantic.victim ?? response.intelligence.victim ?? null,
    confidence: confidence(response.semantic.confidence),
  });
}

function reviewerOpinions(input: ExplanationEngineInput): readonly ExplanationReviewerOpinion[] {
  return Object.freeze(
    input.reviewerDebate.opinions.map((opinion) =>
      Object.freeze({
        reviewerId: opinion.reviewerId,
        reviewerName: opinion.reviewerName,
        status: opinion.status,
        confidence: confidence(opinion.confidence),
        reasoning: opinion.reasoning,
        supportingEvidence: uniqueStrings(opinion.supportingEvidence),
        supportingKnowledge: buildKnowledgeBundle(opinion.supportingKnowledge),
        suggestedArticles: Object.freeze([...opinion.suggestedArticles]),
        rejectedArticles: Object.freeze([...opinion.rejectedArticles]),
        riskLevel: opinion.riskLevel,
        needsHumanReview: opinion.needsHumanReview,
      }),
    ),
  );
}

function explanationCompletenessForFinding(
  finding: ExplanationFinding,
): ExplanationCompletenessScores {
  const sections = [
    finding.semanticReasoning.semanticMeaning,
    finding.knowledgeUsed.lessons.length > 0 || finding.knowledgeUsed.patterns.length > 0 || finding.knowledgeUsed.blueprints.length > 0,
    finding.evidenceChain.length > 0,
    finding.reviewerOpinions.length > 0,
    finding.reasoningChain.length > 0,
    finding.inspectionReferences.length > 0,
    finding.applicableArticles.length > 0 || finding.rejectedArticles.length > 0,
  ].map((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value ? 1 : 0));

  const explanation = average(sections);
  const references = average([
    finding.inspectionReferences.length > 0 ? 1 : 0,
    finding.reviewerOpinions.length > 0 ? 1 : 0,
    finding.rejectedReviewers.length > 0 ? 1 : 0,
  ]);
  const knowledge = average([
    finding.knowledgeUsed.lessons.length > 0 ? 1 : 0,
    finding.knowledgeUsed.patterns.length > 0 ? 1 : 0,
    finding.knowledgeUsed.blueprints.length > 0 ? 1 : 0,
    finding.knowledgeUsed.relationships.length > 0 ? 1 : 0,
    finding.knowledgeUsed.cases.length > 0 ? 1 : 0,
    finding.knowledgeUsed.precedents.length > 0 ? 1 : 0,
  ]);
  const evidence = average([
    finding.evidenceChain.length > 0 ? 1 : 0,
    finding.counterarguments.length > 0 ? 1 : 0,
    finding.confidenceExplanation.evidence > 0 ? 1 : 0,
  ]);
  const reasoning = average([
    finding.reasoningChain.length > 0 ? 1 : 0,
    finding.confidenceExplanation.semantic > 0 ? 1 : 0,
    finding.confidenceExplanation.legal > 0 ? 1 : 0,
    finding.confidenceExplanation.arbitration > 0 ? 1 : 0,
  ]);

  return Object.freeze({
    explanation,
    references,
    knowledge,
    evidence,
    reasoning,
  });
}

function buildFinding(input: ExplanationEngineInput, finding: V3RuntimeFinding, index: number): ExplanationFinding {
  const inspectionReferences = Object.freeze([
    "semantic_generation",
    "knowledge_matching",
    "legal_review",
    "reviewer_debate",
    "arbitration",
    "finding_mapper",
  ]);
  const winningReviewer = input.arbitration.winningReviewer;
  const rejectedReviewers = input.arbitration.rejectedReviewers;
  const reviewerOpinionList = reviewerOpinions(input);
  const evidenceChain = uniqueStrings([
    finding.evidence_snippet ?? "",
    input.analysisResponse.evidence.candidates.map((candidate) => candidate.text).join(" "),
    input.analysisResponse.legalDecision.finding?.evidence.text ?? "",
    input.arbitration.winningEvidence.join(" "),
  ]);
  const reasoningChain = uniqueStrings([
    input.analysisResponse.semantic.semanticMeaning ?? "",
    input.analysisResponse.semantic.riskContext ?? "",
    input.analysisResponse.legalDecision.reason,
    input.arbitration.winningReason,
    input.arbitration.decisionExplanation,
  ]);
  const applicableArticles = uniqueStrings([
    ...input.analysisResponse.legalDecision.articleIds.map(String),
    ...input.arbitration.winningOpinion.suggestedArticles.map(String),
    String(finding.article_id),
  ]).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const rejectedArticles = uniqueStrings([
    ...input.arbitration.rejectedReviewers.flatMap((reviewer) => reviewer.reason ? [] : []),
    ...input.arbitration.winningOpinion.rejectedArticles.map(String),
    ...input.reviewerDebate.opinions.flatMap((opinion) => opinion.rejectedArticles.map(String)),
  ]).map((value) => Number(value)).filter((value) => Number.isFinite(value));

  const knowledgeUsed = buildKnowledgeBundle({
    lessons: input.arbitration.winningLessons,
    patterns: input.arbitration.winningPatterns,
    blueprints: input.arbitration.winningBlueprints,
    relationships: input.arbitration.winningRelationships,
    cases: input.arbitration.winningCases,
    precedents: input.arbitration.winningPrecedents,
  });

  const findingExplanation = Object.freeze({
    findingIndex: index,
    findingKey: finding.canonical_finding_id ?? finding.lineage_id ?? `finding-${index + 1}`,
    findingId: finding.canonical_finding_id ?? `finding-${index + 1}`,
    articleId: finding.article_id,
    atomId: finding.atom_id ?? null,
    title: finding.title_ar ?? input.arbitration.finalDecisionStatus,
    category: finding.category ?? input.arbitration.finalDecisionStatus,
    semanticReasoning: semanticReasoning(input.analysisResponse),
    knowledgeUsed,
    reviewerOpinions: reviewerOpinionList,
    winningReviewer: Object.freeze({
      reviewerId: winningReviewer.reviewerId,
      reviewerName: winningReviewer.reviewerName,
      status: winningReviewer.status,
      confidence: winningReviewer.confidence,
    }),
    rejectedReviewers: Object.freeze(rejectedReviewers.map((reviewer) => Object.freeze({
      reviewerId: reviewer.reviewerId,
      reviewerName: reviewer.reviewerName,
      reason: reviewer.reason,
      status: reviewer.status,
      confidence: reviewer.confidence,
    }))),
    confidenceExplanation: Object.freeze({
      semantic: confidence(input.analysisResponse.semantic.confidence),
      evidence: confidence(input.analysisResponse.evidence.confidence),
      legal: confidence(input.analysisResponse.legalDecision.confidence),
      debate: confidence(input.reviewerDebate.consensusScore),
      arbitration: confidence(input.arbitration.confidence),
      final: confidence(input.arbitration.confidence),
      adjustment: confidence(input.arbitration.confidenceAdjustment),
    }),
    applicableArticles: Object.freeze(applicableArticles),
    rejectedArticles: Object.freeze(rejectedArticles),
    counterarguments: uniqueStrings([
      input.analysisResponse.legalDecision.finding?.reason ?? "",
      input.arbitration.rejectedReasons.join(" "),
      input.arbitration.decisionExplanation,
    ]),
    evidenceChain,
    reasoningChain,
    inspectionReferences,
    completeness: Object.freeze({} as ExplanationCompletenessScores),
  });

  return Object.freeze({
    ...findingExplanation,
    completeness: explanationCompletenessForFinding(findingExplanation),
  });
}

function packageCompleteness(findings: readonly ExplanationFinding[]): ExplanationCompletenessScores {
  if (findings.length === 0) {
    return Object.freeze({
      explanation: 1,
      references: 1,
      knowledge: 1,
      evidence: 1,
      reasoning: 1,
    });
  }

  return Object.freeze({
    explanation: average(findings.map((finding) => finding.completeness.explanation)),
    references: average(findings.map((finding) => finding.completeness.references)),
    knowledge: average(findings.map((finding) => finding.completeness.knowledge)),
    evidence: average(findings.map((finding) => finding.completeness.evidence)),
    reasoning: average(findings.map((finding) => finding.completeness.reasoning)),
  });
}

export function buildExplanationPackage(input: ExplanationEngineInput): ExplanationPackage {
  const findings = Object.freeze(
    (input.findings.length > 0 ? input.findings : []).map((finding, index) => buildFinding(input, finding, index)),
  );
  const summary = packageCompleteness(findings);
  const allApplicableArticles = uniqueStrings(
    findings.flatMap((finding) => finding.applicableArticles.map(String)),
  ).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const allRejectedArticles = uniqueStrings(
    findings.flatMap((finding) => finding.rejectedArticles.map(String)),
  ).map((value) => Number(value)).filter((value) => Number.isFinite(value));

  return Object.freeze({
    jobId: input.jobId,
    chunkId: input.chunkId,
    analysisEngine: "v3",
    pipelineVersion: input.pipelineVersion,
    findingCount: findings.length,
    winningReviewer: Object.freeze({
      reviewerId: input.arbitration.winningReviewer.reviewerId,
      reviewerName: input.arbitration.winningReviewer.reviewerName,
      status: input.arbitration.winningReviewer.status,
      confidence: input.arbitration.winningReviewer.confidence,
    }),
    rejectedReviewers: Object.freeze([...input.arbitration.rejectedReviewers]),
    findings,
    summary: Object.freeze({
      explanationCompleteness: summary.explanation,
      referenceCompleteness: summary.references,
      knowledgeCompleteness: summary.knowledge,
      evidenceCompleteness: summary.evidence,
      reasoningCompleteness: summary.reasoning,
      applicableArticles: Object.freeze(allApplicableArticles),
      rejectedArticles: Object.freeze(allRejectedArticles),
    }),
    metrics: Object.freeze({
      explanationCompleteness: summary.explanation,
      referenceCompleteness: summary.references,
      knowledgeCompleteness: summary.knowledge,
      evidenceCompleteness: summary.evidence,
      reasoningCompleteness: summary.reasoning,
    }),
    inspectionReferences: Object.freeze([
      ...input.diagnostics.stageHashes.map((stage) => stage.stage),
      "reviewer_debate",
      "arbitration",
      "finding_mapper",
    ]),
    diagnostics: input.diagnostics,
    analysisResponse: input.analysisResponse,
    reviewerDebate: input.reviewerDebate,
    arbitration: input.arbitration,
  });
}
