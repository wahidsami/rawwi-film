import type { V3ReasoningReplay, V3ReasoningTraceCandidate, V3ReasoningTraceFinding, V3ReasoningTraceStage, V3ReasoningTraceTimelineEntry } from "./reasoningTypes.js";

function normalizeText(value: string | number | null | undefined): string {
  return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeConfidence(value: unknown, fallback = 0): number {
  return Number(safeNumber(value, fallback).toFixed(6));
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function stageTitle(stage: V3ReasoningReplayAnalyzerStageName): string {
  switch (stage) {
    case "evidence":
      return "Evidence";
    case "semantic_extraction":
      return "Semantic Extraction";
    case "reviewer_ranking":
      return "Reviewer Ranking";
    case "article_ranking":
      return "Article Ranking";
    case "atom_ranking":
      return "Atom Ranking";
    case "prompt_context":
      return "Prompt Context";
    case "provider_reasoning":
      return "Provider Reasoning";
    case "runtime_validation":
      return "Runtime Validation";
    case "final_finding":
      return "Final Finding";
  }
}

function formatScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(6);
}

function formatCandidate(candidate: V3ReasoningTraceCandidate | null): string {
  if (!candidate) return "none";
  return `${candidate.label} (${candidate.id}) score=${formatScore(candidate.score)} confidence=${formatScore(candidate.confidence)}${candidate.selected ? " selected" : ""}`;
}

function formatCandidateList(candidates: readonly V3ReasoningTraceCandidate[]): readonly string[] {
  if (candidates.length === 0) return Object.freeze(["- None"]);
  return Object.freeze(
    [...candidates]
      .sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.label.localeCompare(right.label))
      .map((candidate) => `- ${candidate.label} (${candidate.id}) | score=${formatScore(candidate.score)} | confidence=${formatScore(candidate.confidence)}${candidate.selected ? " | selected" : ""} | why=${candidate.why}`),
  );
}

function selectedCandidate(candidates: readonly V3ReasoningTraceCandidate[]): V3ReasoningTraceCandidate | null {
  return candidates.find((candidate) => candidate.selected) ?? candidates[0] ?? null;
}

function candidateMatch(value: string | number | null | undefined, candidate: V3ReasoningTraceCandidate | null): boolean {
  if (value == null) return true;
  if (!candidate) return false;
  const expected = normalizeText(value);
  return expected.length > 0 && (normalizeText(candidate.id) === expected || normalizeText(candidate.label) === expected);
}

function buildComparisonReason(
  label: string,
  expected: string,
  actual: V3ReasoningTraceCandidate | null,
  candidates: readonly V3ReasoningTraceCandidate[],
): string {
  if (!actual) {
    return `${label} expected ${expected} but no candidate was selected.`;
  }

  const selectedReason = actual.why.length > 0 ? ` Reason: ${actual.why}.` : "";
  const topReason = candidates.length > 0 ? ` Top candidate: ${formatCandidate(candidates[0] ?? null)}.` : "";
  return `${label} expected ${expected} but actual selection was ${formatCandidate(actual)}.${selectedReason}${topReason}`;
}

function replayStagePayload(finding: V3ReasoningTraceFinding): readonly V3ReasoningTraceStage[] {
  return Object.freeze(finding.stages.map((stage) => Object.freeze({
    stage: stage.stage,
    order: stage.order,
    title: stage.title,
    why: stage.why,
    inputCount: stage.inputCount,
    outputCount: stage.outputCount,
    payload: stage.payload,
  })));
}

export type V3ReasoningReplayAnalyzerStageName =
  | "evidence"
  | "semantic_extraction"
  | "reviewer_ranking"
  | "article_ranking"
  | "atom_ranking"
  | "prompt_context"
  | "provider_reasoning"
  | "runtime_validation"
  | "final_finding";

export type V3ReasoningReplayAnalyzerExpectation = Readonly<{
  reviewerId?: string | null;
  reviewerLabel?: string | null;
  articleId?: string | number | null;
  atomId?: string | null;
}>;

export type V3ReasoningReplayAnalyzerDivergence = Readonly<{
  stage: V3ReasoningReplayAnalyzerStageName;
  reason: string;
  expected: Readonly<Record<string, unknown>>;
  actual: Readonly<Record<string, unknown>>;
  lineOfCode: string | null;
}>;

export type V3ReasoningReplayAnalyzerSection = Readonly<{
  stage: V3ReasoningReplayAnalyzerStageName;
  title: string;
  inputCount: number | null;
  outputCount: number | null;
  lines: readonly string[];
}>;

export type V3ReasoningReplayAnalyzerFindingMetrics = Readonly<{
  reviewerAgreement: number;
  articleAgreement: number;
  atomAgreement: number;
  validatorAgreement: number;
  averageConfidence: number;
  promptSizeChars: number;
  promptTokens: number;
  replayTimeline: readonly V3ReasoningTraceTimelineEntry[];
}>;

export type V3ReasoningReplayAnalysisFinding = Readonly<{
  findingIndex: number;
  findingId: string;
  findingKey: string;
  replay: V3ReasoningReplay;
  sections: readonly V3ReasoningReplayAnalyzerSection[];
  firstDivergence: V3ReasoningReplayAnalyzerDivergence | null;
  metrics: V3ReasoningReplayAnalyzerFindingMetrics;
  renderedReplay: string;
}>;

export type V3ReasoningReplayAnalysisMetrics = Readonly<{
  reviewerAgreement: number;
  articleAgreement: number;
  atomAgreement: number;
  validatorAgreement: number;
  averageConfidence: number;
  promptSizeChars: number;
  promptTokens: number;
  replayTimeline: readonly V3ReasoningTraceTimelineEntry[];
}>;

export type V3ReasoningReplayAnalysis = Readonly<{
  jobId: string;
  findings: readonly V3ReasoningReplayAnalysisFinding[];
  firstDivergence: V3ReasoningReplayAnalyzerDivergence | null;
  metrics: V3ReasoningReplayAnalysisMetrics;
  renderedReplay: string;
}>;

export type V3ReasoningReplayAnalyzerInput = Readonly<{
  jobId?: string | null;
  trace: readonly V3ReasoningTraceFinding[];
  expected?: V3ReasoningReplayAnalyzerExpectation | null;
  findingId?: string | null;
  findingKey?: string | null;
}>;

function buildEvidenceSection(finding: V3ReasoningTraceFinding): V3ReasoningReplayAnalyzerSection {
  const scene = asRecord(finding.scene);
  const lines = [
    `Scene confidence: ${formatScore(safeConfidence(scene.confidence))}`,
    `Extracted evidence count: ${finding.extractedEvidence.length}`,
    ...finding.extractedEvidence.map((evidence) => `- ${evidence.quote || evidence.text} | confidence=${formatScore(evidence.confidence)} | reason=${evidence.reason}`),
  ];

  return Object.freeze({
    stage: "evidence",
    title: stageTitle("evidence"),
    inputCount: finding.extractedEvidence.length,
    outputCount: finding.extractedEvidence.length,
    lines: Object.freeze(lines),
  });
}

function buildSemanticExtractionSection(finding: V3ReasoningTraceFinding): V3ReasoningReplayAnalyzerSection {
  const scene = asRecord(finding.scene);
  const semantic = asRecord(scene.semantic);
  const intelligence = asRecord(scene.intelligence);
  const conceptContext = asRecord(intelligence.conceptContext);
  const lines = [
    `Semantic confidence: ${formatScore(safeConfidence(semantic.confidence ?? conceptContext.confidence))}`,
    `Detected keywords: ${finding.detectedKeywords.length === 0 ? "none" : finding.detectedKeywords.join(", ")}`,
    `Detected semantic tags: ${finding.detectedSemanticTags.length === 0 ? "none" : finding.detectedSemanticTags.join(", ")}`,
    `Detected entities: ${finding.detectedEntities.length === 0 ? "none" : finding.detectedEntities.map((entity) => `${entity.label} [${entity.role}]`).join(", ")}`,
  ];

  return Object.freeze({
    stage: "semantic_extraction",
    title: stageTitle("semantic_extraction"),
    inputCount: finding.detectedKeywords.length + finding.detectedSemanticTags.length + finding.detectedEntities.length,
    outputCount: finding.detectedKeywords.length + finding.detectedSemanticTags.length + finding.detectedEntities.length,
    lines: Object.freeze(lines),
  });
}

function buildRankingSection(
  stage: V3ReasoningReplayAnalyzerStageName,
  title: string,
  candidates: readonly V3ReasoningTraceCandidate[],
  selected: V3ReasoningTraceCandidate | null,
  reason: string,
): V3ReasoningReplayAnalyzerSection {
  const lines = [
    ...formatCandidateList(candidates),
    `Selected: ${formatCandidate(selected)}`,
    `Reason: ${reason || "No explicit reason supplied."}`,
  ];

  return Object.freeze({
    stage,
    title,
    inputCount: candidates.length,
    outputCount: selected ? 1 : 0,
    lines: Object.freeze(lines),
  });
}

function buildPromptContextSection(finding: V3ReasoningTraceFinding): V3ReasoningReplayAnalyzerSection {
  const lines = [
    `Prompt chars: ${finding.promptSummary.promptLengthChars}`,
    `User prompt chars: ${finding.promptSummary.userPromptLengthChars}`,
    `Estimated prompt tokens: ${finding.promptSummary.estimatedPromptTokens}`,
    `Prompt hash: ${finding.promptSummary.promptHash}`,
    `User prompt hash: ${finding.promptSummary.userPromptHash}`,
    `Prompt preview: ${finding.promptSummary.promptPreview}`,
    `Prompt summary: ${finding.promptSummary.promptSummary}`,
  ];

  return Object.freeze({
    stage: "prompt_context",
    title: stageTitle("prompt_context"),
    inputCount: finding.promptSummary.promptLengthChars,
    outputCount: finding.promptSummary.estimatedPromptTokens,
    lines: Object.freeze(lines),
  });
}

function buildProviderReasoningSection(finding: V3ReasoningTraceFinding): V3ReasoningReplayAnalyzerSection {
  const lines = [
    `Provider: ${finding.providerResponse.providerName}`,
    `Model: ${finding.providerResponse.modelName}${finding.providerResponse.modelVersion ? ` (${finding.providerResponse.modelVersion})` : ""}`,
    `Status: ${finding.providerResponse.parsedStatus}`,
    `Parsed confidence: ${formatScore(finding.providerResponse.parsedConfidence)}`,
    `Parsed reasoning: ${finding.providerResponse.parsedReasoning}`,
    `Parsed articles: ${finding.providerResponse.parsedArticles.length === 0 ? "none" : finding.providerResponse.parsedArticles.join(", ")}`,
    `Raw response chars: ${finding.providerResponse.rawResponseChars}`,
    `Raw response hash: ${finding.providerResponse.rawResponseHash}`,
  ];

  return Object.freeze({
    stage: "provider_reasoning",
    title: stageTitle("provider_reasoning"),
    inputCount: finding.providerResponse.rawResponseChars,
    outputCount: finding.providerResponse.parsedArticles.length,
    lines: Object.freeze(lines),
  });
}

function buildRuntimeValidationSection(finding: V3ReasoningTraceFinding, firstDivergence: V3ReasoningReplayAnalyzerDivergence | null): V3ReasoningReplayAnalyzerSection {
  const lines = [
    `Grounding valid: ${finding.validatorDecisions.grounding.valid}`,
    `Grounding reason: ${finding.validatorDecisions.grounding.reason}`,
    `Scope valid: ${finding.validatorDecisions.scope.valid}`,
    `Scope reason: ${finding.validatorDecisions.scope.reason}`,
    `Mapping status: ${finding.validatorDecisions.mapping.decisionStatus}`,
    `Mapping reason: ${finding.validatorDecisions.mapping.decisionReason}`,
    `Mapping accepted: ${finding.validatorDecisions.mapping.acceptedCount}`,
    `Mapping rejected: ${finding.validatorDecisions.mapping.rejectedCount}`,
    `Mapping dropped: ${finding.validatorDecisions.mapping.droppedCount}`,
    `Rejection reasons: ${finding.validatorDecisions.rejectionReasons.length === 0 ? "none" : finding.validatorDecisions.rejectionReasons.join(", ")}`,
    firstDivergence ? `First divergence: ${firstDivergence.stage} | ${firstDivergence.reason}` : "First divergence: none",
  ];

  return Object.freeze({
    stage: "runtime_validation",
    title: stageTitle("runtime_validation"),
    inputCount: finding.validatorDecisions.grounding.issues.length + finding.validatorDecisions.scope.rejectedReviewers.length + finding.validatorDecisions.mapping.validatorHistory.length,
    outputCount: finding.validatorDecisions.mapping.acceptedCount,
    lines: Object.freeze(lines),
  });
}

function buildFinalFindingSection(finding: V3ReasoningTraceFinding): V3ReasoningReplayAnalyzerSection {
  const lines = [
    finding.finalFinding === null ? "No final finding was produced." : `Final finding article: ${String(finding.finalFinding.article_id ?? "n/a")}`,
    finding.finalFinding === null ? "Final atom: n/a" : `Final atom: ${String(finding.finalFinding.atom_id ?? "n/a")}`,
    finding.finalFinding === null ? "Final confidence: n/a" : `Final confidence: ${formatScore(safeConfidence(finding.finalFinding.confidence))}`,
    finding.finalFinding === null ? "Final rationale: n/a" : `Final rationale: ${String(finding.finalFinding.rationale_ar ?? finding.finalFinding.description_ar ?? finding.finalFinding.category ?? "n/a")}`,
  ];

  return Object.freeze({
    stage: "final_finding",
    title: stageTitle("final_finding"),
    inputCount: finding.finalFinding ? 1 : 0,
    outputCount: finding.finalFinding ? 1 : 0,
    lines: Object.freeze(lines),
  });
}

function buildSections(finding: V3ReasoningTraceFinding, firstDivergence: V3ReasoningReplayAnalyzerDivergence | null): readonly V3ReasoningReplayAnalyzerSection[] {
  return Object.freeze([
    buildEvidenceSection(finding),
    buildSemanticExtractionSection(finding),
    buildRankingSection("reviewer_ranking", stageTitle("reviewer_ranking"), finding.reviewerCandidates, selectedCandidate(finding.reviewerCandidates), finding.reviewerSelectionReason),
    buildRankingSection("article_ranking", stageTitle("article_ranking"), finding.articleCandidates, selectedCandidate(finding.articleCandidates), finding.articleSelectionReason),
    buildRankingSection("atom_ranking", stageTitle("atom_ranking"), finding.atomCandidates, selectedCandidate(finding.atomCandidates), finding.atomSelectionReason),
    buildPromptContextSection(finding),
    buildProviderReasoningSection(finding),
    buildRuntimeValidationSection(finding, firstDivergence),
    buildFinalFindingSection(finding),
  ]);
}

function renderSection(section: V3ReasoningReplayAnalyzerSection): string {
  return [
    section.title,
    `- Input Count: ${section.inputCount ?? "n/a"}`,
    `- Output Count: ${section.outputCount ?? "n/a"}`,
    ...section.lines.map((line) => `- ${line}`),
  ].join("\n");
}

function renderFindingAnalysis(finding: V3ReasoningReplayAnalysisFinding): string {
  const firstDivergence = finding.firstDivergence
    ? [
        "FIRST DIVERGENCE",
        `- Stage: ${finding.firstDivergence.stage}`,
        `- Reason: ${finding.firstDivergence.reason}`,
      ].join("\n")
    : [
        "FIRST DIVERGENCE",
        "- None",
      ].join("\n");

  return [
    `### Finding ${finding.findingIndex + 1}`,
    `- Finding ID: ${finding.findingId}`,
    `- Finding Key: ${finding.findingKey}`,
    "",
    firstDivergence,
    "",
    ...finding.sections.map((section) => renderSection(section)),
  ].join("\n");
}

function selectedReviewerMismatch(
  finding: V3ReasoningTraceFinding,
  expected: V3ReasoningReplayAnalyzerExpectation,
): V3ReasoningReplayAnalyzerDivergence | null {
  if (expected.reviewerId == null && expected.reviewerLabel == null) return null;
  const selected = selectedCandidate(finding.reviewerCandidates);
  if (candidateMatch(expected.reviewerId, selected) || candidateMatch(expected.reviewerLabel, selected)) {
    return null;
  }

  const expectedText = expected.reviewerLabel ?? expected.reviewerId ?? "unknown reviewer";
  return Object.freeze({
    stage: "reviewer_ranking",
    reason: buildComparisonReason("Reviewer", expectedText, selected, finding.reviewerCandidates),
    expected: Object.freeze({
      reviewerId: expected.reviewerId ?? null,
      reviewerLabel: expected.reviewerLabel ?? null,
    }),
    actual: Object.freeze({
      reviewerId: selected?.id ?? null,
      reviewerLabel: selected?.label ?? null,
      reviewerScore: selected?.score ?? null,
      reviewerConfidence: selected?.confidence ?? null,
    }),
    lineOfCode: null,
  });
}

function selectedArticleMismatch(
  finding: V3ReasoningTraceFinding,
  expected: V3ReasoningReplayAnalyzerExpectation,
): V3ReasoningReplayAnalyzerDivergence | null {
  if (expected.articleId == null) return null;
  const selected = selectedCandidate(finding.articleCandidates);
  const expectedArticle = String(expected.articleId);
  if (candidateMatch(expectedArticle, selected)) {
    return null;
  }

  return Object.freeze({
    stage: "article_ranking",
    reason: buildComparisonReason(`Article ${expectedArticle}`, expectedArticle, selected, finding.articleCandidates),
    expected: Object.freeze({
      articleId: expected.articleId,
    }),
    actual: Object.freeze({
      articleId: selected?.id ?? null,
      articleLabel: selected?.label ?? null,
      articleScore: selected?.score ?? null,
      articleConfidence: selected?.confidence ?? null,
    }),
    lineOfCode: null,
  });
}

function selectedAtomMismatch(
  finding: V3ReasoningTraceFinding,
  expected: V3ReasoningReplayAnalyzerExpectation,
): V3ReasoningReplayAnalyzerDivergence | null {
  if (expected.atomId == null) return null;
  const selected = selectedCandidate(finding.atomCandidates);
  if (candidateMatch(expected.atomId, selected)) {
    return null;
  }

  return Object.freeze({
    stage: "atom_ranking",
    reason: buildComparisonReason(`Atom ${expected.atomId}`, expected.atomId, selected, finding.atomCandidates),
    expected: Object.freeze({
      atomId: expected.atomId,
    }),
    actual: Object.freeze({
      atomId: selected?.id ?? null,
      atomLabel: selected?.label ?? null,
      atomScore: selected?.score ?? null,
      atomConfidence: selected?.confidence ?? null,
    }),
    lineOfCode: null,
  });
}

function validateAgainstTrace(
  finding: V3ReasoningTraceFinding,
  expected: V3ReasoningReplayAnalyzerExpectation | null | undefined,
): V3ReasoningReplayAnalyzerDivergence | null {
  if (expected) {
    const reviewerDivergence = selectedReviewerMismatch(finding, expected);
    if (reviewerDivergence) return reviewerDivergence;

    const articleDivergence = selectedArticleMismatch(finding, expected);
    if (articleDivergence) return articleDivergence;

    const atomDivergence = selectedAtomMismatch(finding, expected);
    if (atomDivergence) return atomDivergence;
  }

  if (!finding.validatorDecisions.grounding.valid) {
    return Object.freeze({
      stage: "runtime_validation",
      reason: finding.validatorDecisions.grounding.reason,
      expected: Object.freeze({ valid: true }),
      actual: Object.freeze({
        valid: finding.validatorDecisions.grounding.valid,
        issues: finding.validatorDecisions.grounding.issues,
        lineOfCode: finding.validatorDecisions.grounding.lineOfCode,
      }),
      lineOfCode: finding.validatorDecisions.grounding.lineOfCode,
    });
  }

  if (!finding.validatorDecisions.scope.valid) {
    return Object.freeze({
      stage: "runtime_validation",
      reason: finding.validatorDecisions.scope.reason,
      expected: Object.freeze({ valid: true }),
      actual: Object.freeze({
        valid: finding.validatorDecisions.scope.valid,
        selectedReviewers: finding.validatorDecisions.scope.selectedReviewers,
        rejectedReviewers: finding.validatorDecisions.scope.rejectedReviewers,
        lineOfCode: finding.validatorDecisions.scope.lineOfCode,
      }),
      lineOfCode: finding.validatorDecisions.scope.lineOfCode,
    });
  }

  if (finding.validatorDecisions.mapping.droppedCount > 0 || finding.validatorDecisions.mapping.decisionStatus === "reject") {
    return Object.freeze({
      stage: "runtime_validation",
      reason: finding.validatorDecisions.mapping.droppedCount > 0
        ? "Mapping dropped the deterministic decision."
        : finding.validatorDecisions.mapping.decisionReason,
      expected: Object.freeze({ droppedCount: 0 }),
      actual: Object.freeze({
        decisionStatus: finding.validatorDecisions.mapping.decisionStatus,
        decisionArticle: finding.validatorDecisions.mapping.decisionArticle,
        decisionAtom: finding.validatorDecisions.mapping.decisionAtom,
        decisionReason: finding.validatorDecisions.mapping.decisionReason,
        droppedCount: finding.validatorDecisions.mapping.droppedCount,
        validatorHistory: finding.validatorDecisions.mapping.validatorHistory,
        lineOfCode: finding.validatorDecisions.mapping.lineOfCode,
      }),
      lineOfCode: finding.validatorDecisions.mapping.lineOfCode,
    });
  }

  if (finding.finalFinding === null) {
    return Object.freeze({
      stage: "final_finding",
      reason: "No final finding was produced.",
      expected: Object.freeze({ finalFinding: true }),
      actual: Object.freeze({ finalFinding: null }),
      lineOfCode: null,
    });
  }

  return null;
}

function buildFindingAnalysis(
  finding: V3ReasoningTraceFinding,
  expected: V3ReasoningReplayAnalyzerExpectation | null | undefined,
  jobId: string,
): V3ReasoningReplayAnalysisFinding {
  const firstDivergence = validateAgainstTrace(finding, expected);
  const sections = buildSections(finding, firstDivergence);
  const replay: V3ReasoningReplay = Object.freeze({
    jobId,
    findingId: finding.findingId,
    findingKey: finding.findingKey,
    timeline: finding.decisionTimeline,
    stages: replayStagePayload(finding),
    firstIncorrectDecision: firstDivergence
      ? Object.freeze({
          stage: firstDivergence.stage === "reviewer_ranking"
            ? "reviewer_candidates"
            : firstDivergence.stage === "article_ranking"
              ? "article_candidates"
              : firstDivergence.stage === "atom_ranking"
                ? "atom_candidates"
                : "validator_decisions",
          reason: firstDivergence.reason,
          payload: firstDivergence.actual,
        })
      : null,
    trace: finding,
  });

  const reviewerSelected = selectedCandidate(finding.reviewerCandidates);
  const articleSelected = selectedCandidate(finding.articleCandidates);
  const atomSelected = selectedCandidate(finding.atomCandidates);
  const selectedConfidences = [
    reviewerSelected?.confidence,
    articleSelected?.confidence,
    atomSelected?.confidence,
    finding.providerResponse.parsedConfidence,
    finding.validatorDecisions.grounding.valid ? 1 : 0,
    finding.validatorDecisions.scope.valid ? 1 : 0,
    finding.validatorDecisions.mapping.droppedCount === 0 ? 1 : 0,
  ].filter((value): value is number => typeof value === "number");

  const metrics: V3ReasoningReplayAnalyzerFindingMetrics = Object.freeze({
    reviewerAgreement: finding.reviewerCandidates.length === 0
      ? 0
      : clampRatio((reviewerSelected?.score ?? 0) / Math.max(finding.reviewerCandidates[0]?.score ?? 1, 1e-9)),
    articleAgreement: finding.articleCandidates.length === 0
      ? 0
      : clampRatio((articleSelected?.score ?? 0) / Math.max(finding.articleCandidates[0]?.score ?? 1, 1e-9)),
    atomAgreement: finding.atomCandidates.length === 0
      ? 0
      : clampRatio((atomSelected?.score ?? 0) / Math.max(finding.atomCandidates[0]?.score ?? 1, 1e-9)),
    validatorAgreement: clampRatio([
      finding.validatorDecisions.grounding.valid,
      finding.validatorDecisions.scope.valid,
      finding.validatorDecisions.mapping.droppedCount === 0,
    ].filter(Boolean).length / 3),
    averageConfidence: average(selectedConfidences),
    promptSizeChars: finding.promptLengthChars,
    promptTokens: finding.promptTokens,
    replayTimeline: finding.decisionTimeline,
  });

  return Object.freeze({
    findingIndex: finding.findingIndex,
    findingId: finding.findingId,
    findingKey: finding.findingKey,
    replay,
    sections,
    firstDivergence,
    metrics,
    renderedReplay: renderFindingAnalysis(Object.freeze({
      findingIndex: finding.findingIndex,
      findingId: finding.findingId,
      findingKey: finding.findingKey,
      replay,
      sections,
      firstDivergence,
      metrics,
      renderedReplay: "",
    })),
  });
}

function aggregateMetrics(findings: readonly V3ReasoningReplayAnalysisFinding[]): V3ReasoningReplayAnalysisMetrics {
  const metrics = findings.map((finding) => finding.metrics);
  const replayTimeline = findings.flatMap((finding) => finding.metrics.replayTimeline);
  return Object.freeze({
    reviewerAgreement: average(metrics.map((metric) => metric.reviewerAgreement)),
    articleAgreement: average(metrics.map((metric) => metric.articleAgreement)),
    atomAgreement: average(metrics.map((metric) => metric.atomAgreement)),
    validatorAgreement: average(metrics.map((metric) => metric.validatorAgreement)),
    averageConfidence: average(metrics.map((metric) => metric.averageConfidence)),
    promptSizeChars: findings[0]?.metrics.promptSizeChars ?? 0,
    promptTokens: findings[0]?.metrics.promptTokens ?? 0,
    replayTimeline: Object.freeze(replayTimeline),
  });
}

function renderAnalysis(findings: readonly V3ReasoningReplayAnalysisFinding[], metrics: V3ReasoningReplayAnalysisMetrics): string {
  return [
    "## Reasoning Replay Analysis",
    `- Findings: ${findings.length}`,
    `- Reviewer agreement: ${formatScore(metrics.reviewerAgreement)}`,
    `- Article agreement: ${formatScore(metrics.articleAgreement)}`,
    `- Atom agreement: ${formatScore(metrics.atomAgreement)}`,
    `- Validator agreement: ${formatScore(metrics.validatorAgreement)}`,
    `- Average confidence: ${formatScore(metrics.averageConfidence)}`,
    `- Prompt size chars: ${metrics.promptSizeChars}`,
    `- Prompt tokens: ${metrics.promptTokens}`,
    "",
    ...findings.flatMap((finding, index) => [
      renderFindingAnalysis(finding),
      index < findings.length - 1 ? "\n---\n" : "",
    ]),
  ].join("\n");
}

export function analyzeV3ReasoningTrace(input: V3ReasoningReplayAnalyzerInput): V3ReasoningReplayAnalysis {
  const selectedFindings = input.findingId || input.findingKey
    ? input.trace.filter((finding) =>
        (input.findingId ? normalizeText(finding.findingId) === normalizeText(input.findingId) : true) &&
        (input.findingKey ? normalizeText(finding.findingKey) === normalizeText(input.findingKey) : true),
      )
    : [...input.trace];

  const jobId = input.jobId ?? "";
  const findings = Object.freeze(
    (selectedFindings.length > 0 ? selectedFindings : input.trace).map((finding) => buildFindingAnalysis(finding, input.expected ?? null, jobId)),
  );
  const metrics = aggregateMetrics(findings);
  const firstDivergence = findings.find((finding) => finding.firstDivergence !== null)?.firstDivergence ?? null;

  return Object.freeze({
    jobId: jobId || findings[0]?.replay.jobId || "",
    findings,
    firstDivergence,
    metrics,
    renderedReplay: renderAnalysis(findings, metrics),
  });
}

export function renderV3ReasoningReplayAnalysis(analysis: V3ReasoningReplayAnalysis): string {
  return analysis.renderedReplay;
}
