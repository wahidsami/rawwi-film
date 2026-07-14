import type { V3DebugReport } from "./debugTypes.js";
import { renderV3DebugSummary } from "./debugSummary.js";
import { renderV3DebugTimeline } from "./debugTimeline.js";
import { renderV3ReasoningTraceSection } from "./reasoningTraceRenderer.js";

function bulletList(values: readonly string[]): string {
  if (values.length === 0) return "- None";
  return values.map((value) => `- ${value}`).join("\n");
}

function numberedList(values: readonly string[]): string {
  if (values.length === 0) return "1. None";
  return values.map((value, index) => `${index + 1}. ${value}`).join("\n");
}

function renderScalar(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number" && !Number.isFinite(value)) return "n/a";
  return String(value);
}

function renderDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value}ms`;
}

function renderAcademy(report: V3DebugReport): string {
  const lessons = report.academy.loadedLessons.map((lesson) => `${lesson.id} (${lesson.version}) - ${lesson.title}`);
  const packs = report.academy.loadedReviewerPacks.map((pack) => `${pack.id} [${pack.moduleId}] - ${pack.title}`);
  const patterns = report.academy.loadedPatternLibraries.map((pattern) => `${pattern.id} (${pattern.version}) - ${pattern.title} [${pattern.entryCount}]`);
  const decisions = report.academy.loadedDecisionRecords.map((record) => `${record.id} (${record.version}) - ${record.title} [${record.confidence}/${record.findingType}]`);
  const blueprints = report.academy.loadedBlueprints.map((blueprint) => `${blueprint.folder} :: ${blueprint.files.join(", ") || "None"}`);

  return [
    "## Academy",
    "",
    `### Loaded Lessons (${report.academy.loadedLessons.length})`,
    numberedList(lessons),
    "",
    `### Loaded Reviewer Packs (${report.academy.loadedReviewerPacks.length})`,
    numberedList(packs),
    "",
    `### Loaded Pattern Libraries (${report.academy.loadedPatternLibraries.length})`,
    numberedList(patterns),
    "",
    `### Loaded Decision Records (${report.academy.loadedDecisionRecords.length})`,
    numberedList(decisions),
    "",
    `### Loaded Blueprints (${report.academy.loadedBlueprints.length})`,
    numberedList(blueprints),
  ].join("\n");
}

function renderIntelligence(report: V3DebugReport): string {
  return [
    "## Intelligence",
    "",
    `### Detected Concepts (${report.intelligence.detectedConcepts.length})`,
    bulletList(report.intelligence.detectedConcepts),
    "",
    `### Detected Entities (${report.intelligence.detectedEntities.length})`,
    bulletList(report.intelligence.detectedEntities),
    "",
    `### Detected Targets (${report.intelligence.detectedTargets.length})`,
    bulletList(report.intelligence.detectedTargets),
    "",
    `### Detected Intents (${report.intelligence.detectedIntents.length})`,
    bulletList(report.intelligence.detectedIntents),
    "",
    `### Detected Contexts (${report.intelligence.detectedContexts.length})`,
    bulletList(report.intelligence.detectedContexts),
  ].join("\n");
}

function renderReviewer(report: V3DebugReport): string {
  return [
    "## Reviewer",
    "",
    "### Reviewer Questions Asked",
    numberedList(report.reviewer.reviewerQuestionsAsked),
    "",
    "### Evidence Collected",
    numberedList(report.reviewer.evidenceCollected),
    "",
    "### Confidence Evolution",
    report.reviewer.confidenceEvolution.length === 0
      ? "- None"
      : report.reviewer.confidenceEvolution.map((entry, index) => `${index + 1}. ${entry.stage}: ${entry.confidence}${entry.note ? ` (${entry.note})` : ""}`).join("\n"),
    "",
    "### Discarded Hypotheses",
    numberedList(report.reviewer.discardedHypotheses),
    "",
    "### Accepted Hypotheses",
    numberedList(report.reviewer.acceptedHypotheses),
  ].join("\n");
}

function renderLegal(report: V3DebugReport): string {
  return [
    "## Legal",
    "",
    `### Candidate GCAM Articles`,
    bulletList(report.legal.candidateGcamArticles.map((article) => String(article))),
    "",
    `### Final Article`,
    report.legal.finalArticle === null ? "- None" : `- ${report.legal.finalArticle}`,
    "",
    "### Reasoning Path",
    numberedList(report.legal.reasoningPath),
  ].join("\n");
}

function renderGcamMapping(report: V3DebugReport): string {
  return [
    "## GCAM Mapping",
    "",
    `- Article: ${renderScalar(report.gcamMapping.article)}`,
    `- Atom: ${renderScalar(report.gcamMapping.atom)}`,
    `- Mapping Confidence: ${renderScalar(report.gcamMapping.mappingConfidence)}`,
    `- Mapping Source: ${renderScalar(report.gcamMapping.mappingSource)}`,
    `- Mapping Status: ${renderScalar(report.gcamMapping.mappingStatus)}`,
    "",
    "### Knowledge Debt",
    numberedList(report.gcamMapping.knowledgeDebt),
  ].join("\n");
}

function renderReviewerJudgment(report: V3DebugReport): string {
  return [
    "## Reviewer Judgment",
    "",
    `- Primary Decision: ${report.reviewerJudgment.primaryDecision}`,
    "",
    "### Alternative Decisions",
    numberedList(report.reviewerJudgment.alternativeDecisions),
    "",
    "### Rejected Interpretations",
    numberedList(report.reviewerJudgment.rejectedInterpretations),
    "",
    `- Confidence: ${renderScalar(report.reviewerJudgment.confidence)}`,
    "",
    "### Evidence Used",
    numberedList(report.reviewerJudgment.evidenceUsed),
    "",
    "### Decision Records Used",
    numberedList(report.reviewerJudgment.decisionRecordsUsed),
  ].join("\n");
}

function renderReasoningChain(report: V3DebugReport): string {
  const section = (title: string, values: readonly string[]): string => [
    `### ${title}`,
    numberedList(values),
  ].join("\n");

  return [
    "## Reasoning Chain",
    "",
    section("Narrative", report.reasoningChain.narrative),
    "",
    section("Intent", report.reasoningChain.intent),
    "",
    section("Relationships", report.reasoningChain.relationships),
    "",
    section("Context", report.reasoningChain.context),
    "",
    section("Evidence", report.reasoningChain.evidence),
    "",
    section("Methodology", report.reasoningChain.methodology),
    "",
    section("Judgment", report.reasoningChain.judgment),
    "",
    section("GCAM Mapping", report.reasoningChain.gcamMapping),
  ].join("\n");
}

function renderKnowledgeUsage(report: V3DebugReport): string {
  return [
    "## Knowledge Usage",
    "",
    "### Lessons Used",
    numberedList(report.knowledgeUsage.lessonsUsed),
    "",
    "### Patterns Used",
    numberedList(report.knowledgeUsage.patternsUsed),
    "",
    "### Decision Records Used",
    numberedList(report.knowledgeUsage.decisionRecordsUsed),
    "",
    "### Benchmarks Referenced",
    numberedList(report.knowledgeUsage.benchmarksReferenced),
    "",
    "### Knowledge Acquisition Records",
    numberedList(report.knowledgeUsage.knowledgeAcquisitionRecords),
  ].join("\n");
}

function renderFindingGeneration(report: V3DebugReport): string {
  return [
    "## Finding Generation",
    "",
    `- Finding Title: ${renderScalar(report.findingGeneration.findingTitle)}`,
    `- Finding Category: ${renderScalar(report.findingGeneration.findingCategory)}`,
    `- Mapped Article: ${renderScalar(report.findingGeneration.mappedArticle)}`,
    `- Mapped Atom: ${renderScalar(report.findingGeneration.mappedAtom)}`,
    `- Confidence: ${renderScalar(report.findingGeneration.confidence)}`,
    `- Decision: ${report.findingGeneration.decision}`,
    "",
    "### Evidence",
    numberedList(report.findingGeneration.evidence),
  ].join("\n");
}

function renderPerformance(report: V3DebugReport): string {
  const stageTimings = report.performance.stageTimings.map((entry) => `${entry.stage}: ${entry.durationMs === null ? "n/a" : entry.durationMs}ms`);
  return [
    "## Performance",
    "",
    "### Stage Timings",
    numberedList(stageTimings),
    "",
    `- Knowledge Loading Time: ${renderDuration(report.performance.knowledgeLoadingTimeMs)}`,
    `- Reasoning Time: ${renderDuration(report.performance.reasoningTimeMs)}`,
    `- Mapping Time: ${renderDuration(report.performance.mappingTimeMs)}`,
    `- Finding Generation Time: ${renderDuration(report.performance.findingGenerationTimeMs)}`,
  ].join("\n");
}

function renderOutput(report: V3DebugReport): string {
  return [
    "## Output",
    "",
    `### Findings (${report.output.findings.length})`,
    report.output.findings.length === 0
      ? "- None"
      : report.output.findings.map((finding, index) => `${index + 1}. ${finding.title_ar} | article ${finding.article_id} | atom ${finding.atom_id} | confidence ${finding.confidence}`).join("\n"),
    "",
    `### Observations (${report.output.observations.length})`,
    numberedList(report.output.observations),
    "",
    `### Confidence`,
    `- ${report.output.confidence}`,
    "",
    "### Diagnostics Hashes",
    bulletList([
      `prompt: ${report.output.diagnosticsHashes.promptHash}`,
      `semantic: ${report.output.diagnosticsHashes.semanticHash}`,
      `legal: ${report.output.diagnosticsHashes.legalHash}`,
      `raw response: ${report.output.diagnosticsHashes.rawResponseHash ?? "n/a"}`,
      `execution signature: ${report.output.diagnosticsHashes.executionSignatureHash ?? "n/a"}`,
    ]),
  ].join("\n");
}

export function renderV3DebugReport(report: V3DebugReport): string {
  return [
    "# V3 Brain Debug Report",
    "",
    `- Report Hash: ${report.hash}`,
    `- Engine Version: ${report.general.engineVersion}`,
    `- Provider: ${report.general.provider}`,
    `- Model: ${report.general.model}`,
    `- Execution Time (ms): ${report.general.executionTimeMs === null ? "n/a" : report.general.executionTimeMs}`,
    `- Total Prompt Size: ${report.general.totalPromptSize === null ? "n/a" : report.general.totalPromptSize}`,
    `- Total Completion Size: ${report.general.totalCompletionSize === null ? "n/a" : report.general.totalCompletionSize}`,
    `- Prompt Hash: ${report.general.promptHash}`,
    `- Semantic Hash: ${report.general.semanticHash}`,
    `- Legal Hash: ${report.general.legalHash}`,
    `- Raw Response Hash: ${report.general.rawResponseHash ?? "n/a"}`,
    `- Execution Signature Hash: ${report.general.executionSignatureHash ?? "n/a"}`,
    "",
    renderV3DebugSummary(report.summary),
    "",
    renderAcademy(report),
    "",
    renderIntelligence(report),
    "",
    renderReviewer(report),
    "",
    renderGcamMapping(report),
    "",
    renderReviewerJudgment(report),
    "",
    renderReasoningChain(report),
    "",
    renderKnowledgeUsage(report),
    "",
    renderFindingGeneration(report),
    "",
    renderPerformance(report),
    "",
    renderV3ReasoningTraceSection(report.reasoningTrace),
    "",
    renderLegal(report),
    "",
    renderOutput(report),
    "",
    renderV3DebugTimeline(report.timeline),
  ].join("\n");
}
