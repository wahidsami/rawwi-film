import type { BenchmarkReport } from "./benchmarkTypes.js";

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function list(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function formatFailures(report: BenchmarkReport): string {
  const lines: string[] = [];
  for (const stage of Object.keys(report.perStageFailures) as Array<keyof typeof report.perStageFailures>) {
    const failures = report.perStageFailures[stage];
    if (failures.length === 0) {
      continue;
    }
    lines.push(`### ${stage}`);
    for (const failure of failures) {
      lines.push(`- [${failure.findingId}] ${failure.code}: ${failure.message}`);
      lines.push(`  - expected: ${failure.expected}`);
      lines.push(`  - actual: ${failure.actual}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function renderBenchmarkReportMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# V4 Benchmark Report`);
  lines.push("");
  lines.push(`Benchmark ID: ${report.benchmarkId}`);
  lines.push("");
  lines.push(`## Metrics`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Finding Precision | ${percent(report.metrics.findingPrecision)} |`);
  lines.push(`| Finding Recall | ${percent(report.metrics.findingRecall)} |`);
  lines.push(`| Evidence Accuracy | ${percent(report.metrics.evidenceAccuracy)} |`);
  lines.push(`| Evidence Span Accuracy | ${percent(report.metrics.evidenceSpanAccuracy)} |`);
  lines.push(`| Concept Accuracy | ${percent(report.metrics.conceptAccuracy)} |`);
  lines.push(`| GCAM Article Accuracy | ${percent(report.metrics.gcamArticleAccuracy)} |`);
  lines.push(`| Explanation Accuracy | ${percent(report.metrics.explanationAccuracy)} |`);
  lines.push(`| Duplicate Finding Rate | ${percent(report.metrics.duplicateFindingRate)} |`);
  lines.push(`| Hallucination Rate | ${percent(report.metrics.hallucinationRate)} |`);
  lines.push(`| Overall Review Score | ${percent(report.metrics.overallReviewScore)} |`);
  lines.push("");

  lines.push(`## Stage Scores`);
  lines.push("");
  lines.push("| Stage | Score | Passed | Total |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const stage of ["scene_understanding", "evidence_extraction", "concept_classification", "legal_mapping", "explanation", "judge"] as const) {
    const score = report.stageScores[stage];
    lines.push(`| ${stage} | ${percent(score.score)} | ${score.passed} | ${score.total} |`);
  }
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- False positives: ${report.falsePositives.length}`);
  lines.push(`- False negatives: ${report.falseNegatives.length}`);
  lines.push(`- Incorrect evidence: ${report.incorrectEvidence.length}`);
  lines.push(`- Incorrect article mapping: ${report.incorrectArticleMappings.length}`);
  lines.push(`- Hallucinated explanations: ${report.hallucinatedExplanations.length}`);
  lines.push("");

  if (report.falsePositives.length > 0) {
    lines.push(`## False Positives`);
    for (const finding of report.falsePositives) {
      lines.push(`- ${finding.findingId}: article ${finding.gcamArticleId ?? "n/a"} | evidence ${finding.evidence.text || "n/a"}`);
    }
    lines.push("");
  }

  if (report.falseNegatives.length > 0) {
    lines.push(`## False Negatives`);
    for (const finding of report.falseNegatives) {
      lines.push(`- ${finding.findingId}: article ${finding.expectedGcamArticleId} | evidence ${finding.expectedEvidence.text}`);
    }
    lines.push("");
  }

  if (report.incorrectEvidence.length > 0) {
    lines.push(`## Incorrect Evidence`);
    for (const comparison of report.incorrectEvidence) {
      lines.push(`- ${comparison.findingId}: expected "${comparison.expected.expectedEvidence.text}" but got "${comparison.actual?.evidence.text ?? "n/a"}"`);
    }
    lines.push("");
  }

  if (report.incorrectArticleMappings.length > 0) {
    lines.push(`## Incorrect Article Mapping`);
    for (const comparison of report.incorrectArticleMappings) {
      lines.push(`- ${comparison.findingId}: expected article ${comparison.expected.expectedGcamArticleId} but got ${comparison.actual?.gcamArticleId ?? "n/a"}`);
    }
    lines.push("");
  }

  if (report.hallucinatedExplanations.length > 0) {
    lines.push(`## Hallucinated Explanations`);
    for (const comparison of report.hallucinatedExplanations) {
      lines.push(`- ${comparison.findingId}: ${comparison.actual?.explanation ?? "n/a"}`);
    }
    lines.push("");
  }

  const failures = formatFailures(report);
  if (failures.length > 0) {
    lines.push(`## Per-Stage Failures`);
    lines.push("");
    lines.push(failures);
    lines.push("");
  }

  lines.push(`## Cases`);
  lines.push("");
  for (const result of report.cases) {
    lines.push(`### ${result.screenplayId}`);
    lines.push(`- Scene ID: ${result.sceneId}`);
    lines.push(`- Scene Summary: ${result.sceneSummary}`);
    lines.push(`- Expected Findings: ${result.findingComparisons.length}`);
    lines.push(`- Actual Findings: ${result.actualFindings.length}`);
    lines.push(`- Duplicate Findings: ${result.duplicateFindingCount}`);
    lines.push(`- Hallucinations: ${result.hallucinationCount}`);
    lines.push(`- Trace Nodes: ${list(result.traceDocument.nodeExecutionOrder)}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

