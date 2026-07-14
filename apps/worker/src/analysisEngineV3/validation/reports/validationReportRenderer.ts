import type { ValidationReport } from "../types/validationTypes.js";

function bullet(values: readonly string[]): string {
  return values.length === 0 ? "- None" : values.map((value) => `- ${value}`).join("\n");
}

function renderCaseResult(caseResult: ValidationReport["cases"][number]): string {
  const mismatches = Object.entries(caseResult.mismatches)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return [
    `### ${caseResult.case.id} - ${caseResult.case.title}`,
    `- Passed: ${caseResult.passed ? "YES" : "NO"}`,
    `- Concepts: ${caseResult.actualConcepts.join(", ") || "none"}`,
    `- Intent: ${caseResult.actualIntent}`,
    `- Context: ${caseResult.actualContext}`,
    `- Evidence: ${caseResult.actualEvidence}`,
    `- Judgment: ${caseResult.actualJudgment}`,
    `- Articles: ${caseResult.actualArticleMapping.join(", ") || "none"}`,
    `- Atom: ${caseResult.actualAtomId ?? "none"}`,
    `- Legal Module: ${caseResult.actualLegalModule ?? "none"}`,
    `- Confidence: ${caseResult.actualFinding.confidence}`,
    `- Mismatches: ${mismatches.length === 0 ? "none" : mismatches.join(", ")}`,
    `- Trace Hash: ${caseResult.reasoningTrace?.hash ?? "n/a"}`,
    `- Trace Stages: ${caseResult.reasoningTrace?.stages.length ?? 0}`,
  ].join("\n");
}

function renderKnowledgeGaps(report: ValidationReport): string {
  return [
    "## Knowledge Gap Report",
    "",
    `- Gap Count: ${report.knowledgeGaps.gapCount}`,
    `- Missing Knowledge Count: ${report.knowledgeGaps.missingKnowledgeCount}`,
    `- Hash: ${report.knowledgeGaps.hash}`,
    "",
    report.knowledgeGaps.gaps.length === 0
      ? "- None"
      : report.knowledgeGaps.gaps
          .map((gap) => [
            `- Case: ${gap.caseId}`,
            `  - Field: ${gap.field}`,
            `  - Reason: ${gap.reason}`,
            `  - Missing Knowledge: ${gap.missingKnowledge.join(", ") || "none"}`,
            `  - Decision Record: ${gap.possibleDecisionRecord ?? "none"}`,
            `  - Lesson: ${gap.possibleLesson ?? "none"}`,
            `  - Pattern: ${gap.possiblePattern ?? "none"}`,
            `  - Benchmark: ${gap.possibleBenchmark ?? "none"}`,
          ].join("\n"))
          .join("\n"),
  ].join("\n");
}

function renderReasoning(report: ValidationReport): string {
  return [
    "## Reasoning Report",
    "",
    `- Trace Count: ${report.reasoning.traceCount}`,
    `- Hash: ${report.reasoning.hash}`,
    "",
    report.reasoning.traces.length === 0
      ? "- None"
      : report.reasoning.traces
          .map((trace) => [
            `- Case: ${trace.caseId}`,
            `  - Trace Hash: ${trace.traceHash ?? "n/a"}`,
            `  - Stage Count: ${trace.stageCount}`,
            `  - Article IDs: ${trace.articleIds.join(", ") || "none"}`,
            `  - Atom ID: ${trace.atomId ?? "none"}`,
          ].join("\n"))
          .join("\n"),
  ].join("\n");
}

export function renderValidationReport(report: ValidationReport): string {
  return [
    "# V3 Offline Validation Harness Report",
    "",
    `- Report Hash: ${report.hash}`,
    `- Readiness Score: ${report.summary.readinessScore.toFixed(2)}`,
    `- Production Readiness: ${report.summary.productionReadiness ? "YES" : "NO"}`,
    `- Recommendation: ${report.summary.recommendation}`,
    `- Status: ${report.summary.status}`,
    "",
    "## Metrics",
    "",
    `- Total Cases: ${report.metrics.totalCases}`,
    `- Passed Cases: ${report.metrics.passedCases}`,
    `- Pass Rate: ${report.metrics.passRate.toFixed(2)}%`,
    `- Precision: ${report.metrics.precision.toFixed(2)}%`,
    `- Recall: ${report.metrics.recall.toFixed(2)}%`,
    `- False Positives: ${report.metrics.falsePositives}`,
    `- False Negatives: ${report.metrics.falseNegatives}`,
    `- Concept Accuracy: ${report.metrics.conceptAccuracy.toFixed(2)}%`,
    `- Intent Accuracy: ${report.metrics.intentAccuracy.toFixed(2)}%`,
    `- Context Accuracy: ${report.metrics.contextAccuracy.toFixed(2)}%`,
    `- Evidence Accuracy: ${report.metrics.evidenceAccuracy.toFixed(2)}%`,
    `- Judgment Accuracy: ${report.metrics.judgmentAccuracy.toFixed(2)}%`,
    `- Article Accuracy: ${report.metrics.articleAccuracy.toFixed(2)}%`,
    `- Atom Accuracy: ${report.metrics.atomAccuracy.toFixed(2)}%`,
    `- Finding Accuracy: ${report.metrics.findingAccuracy.toFixed(2)}%`,
    `- Explanation Accuracy: ${report.metrics.explanationAccuracy.toFixed(2)}%`,
    `- Confidence Accuracy: ${report.metrics.confidenceAccuracy.toFixed(2)}%`,
    `- Readiness Score: ${report.metrics.readinessScore.toFixed(2)}%`,
    "",
    "## Coverage Report",
    "",
    `- Overall Coverage: ${report.coverage.overallCoverage.toFixed(2)}%`,
    `- Concept Coverage: ${report.coverage.conceptCoverage.toFixed(2)}%`,
    `- Intent Coverage: ${report.coverage.intentCoverage.toFixed(2)}%`,
    `- Context Coverage: ${report.coverage.contextCoverage.toFixed(2)}%`,
    `- Evidence Coverage: ${report.coverage.evidenceCoverage.toFixed(2)}%`,
    `- Judgment Coverage: ${report.coverage.judgmentCoverage.toFixed(2)}%`,
    `- Article Coverage: ${report.coverage.articleCoverage.toFixed(2)}%`,
    `- Atom Coverage: ${report.coverage.atomCoverage.toFixed(2)}%`,
    `- Finding Coverage: ${report.coverage.findingCoverage.toFixed(2)}%`,
    `- Explanation Coverage: ${report.coverage.explanationCoverage.toFixed(2)}%`,
    `- Confidence Coverage: ${report.coverage.confidenceCoverage.toFixed(2)}%`,
    `- Missing Count: ${report.coverage.missingCount}`,
    `- Hash: ${report.coverage.hash}`,
    "",
    renderReasoning(report),
    "",
    renderKnowledgeGaps(report),
    "",
    "## Cases",
    "",
    report.cases.map((caseResult) => renderCaseResult(caseResult)).join("\n\n"),
    "",
    `- Statistics Hash: ${report.statistics.hash}`,
    `- Statistics Total Cases: ${report.statistics.totalCases}`,
    `- Unique Concepts: ${report.statistics.uniqueConceptCount}`,
    `- Unique Articles: ${report.statistics.uniqueArticleCount}`,
    `- Unique Atoms: ${report.statistics.uniqueAtomCount}`,
    `- Unique Intents: ${report.statistics.uniqueIntentCount}`,
    `- Trace Count: ${report.statistics.traceCount}`,
    `- Total Evidence Items: ${report.statistics.totalEvidenceItems}`,
    `- Total Reasoning Stages: ${report.statistics.totalReasoningStages}`,
    `- Warning Count: ${report.statistics.warningCount}`,
    `- Error Count: ${report.statistics.errorCount}`,
  ].join("\n");
}

