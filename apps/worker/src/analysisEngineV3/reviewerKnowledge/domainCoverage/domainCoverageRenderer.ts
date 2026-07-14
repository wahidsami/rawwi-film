import type { DomainCoverageMetrics, DomainCoverageReport, DomainCoverageSection, DomainCoverageTopicMetric } from "./domainCoverageTypes.js";

function fmtPercent(value: number): string {
  return `${Math.floor(value)}%`;
}

function renderSectionTable(sections: readonly DomainCoverageSection[]): string {
  const lines = [
    "| Section | Present | Expected | Coverage |",
    "|---|---:|---:|---:|",
  ];
  for (const section of sections) {
    lines.push(`| ${section.title} | ${section.present} | ${section.expected} | ${fmtPercent(section.coveragePercent)} |`);
  }
  return lines.join("\n");
}

function renderTopicTable(topics: readonly DomainCoverageTopicMetric[]): string {
  const lines = [
    "| Topic | Present | Expected | Coverage |",
    "|---|---:|---:|---:|",
  ];
  for (const topic of topics) {
    lines.push(`| ${topic.title} | ${topic.present} | ${topic.expected} | ${fmtPercent(topic.coveragePercent)} |`);
  }
  return lines.join("\n");
}

function renderList(title: string, values: readonly string[]): string {
  const lines = [`## ${title}`];
  if (values.length === 0) {
    lines.push("- None");
    return lines.join("\n");
  }
  for (const value of values) {
    lines.push(`- ${value}`);
  }
  return lines.join("\n");
}

function renderMetrics(metrics: DomainCoverageMetrics): string {
  const lines = [
    "## Metrics",
    "",
    "| Metric | Coverage |",
    "|---|---:|",
    `| Concept Count | ${metrics.conceptCount} |`,
    `| Duplicate Concepts | ${metrics.duplicateConceptCount} |`,
    `| Missing Concepts | ${metrics.missingConceptCount} |`,
    `| Missing Pattern Coverage | ${metrics.missingPatternCoverage} |`,
    `| Missing Decision Coverage | ${metrics.missingDecisionCoverage} |`,
    `| Missing Benchmark Coverage | ${metrics.missingBenchmarkCoverage} |`,
    `| Glossary Coverage | ${fmtPercent(metrics.glossaryCoverage)} |`,
    `| Cross Sentence Coverage | ${fmtPercent(metrics.crossSentenceCoverage)} |`,
    `| Cross Scene Coverage | ${fmtPercent(metrics.crossSceneCoverage)} |`,
    `| Description Coverage | ${fmtPercent(metrics.descriptionCoverage)} |`,
    `| Dialogue Coverage | ${fmtPercent(metrics.dialogueCoverage)} |`,
    `| Observation Coverage | ${fmtPercent(metrics.observationCoverage)} |`,
    `| Contexts Coverage | ${fmtPercent(metrics.contextsCoverage)} |`,
    `| Targets Coverage | ${fmtPercent(metrics.targetsCoverage)} |`,
    `| Actions Coverage | ${fmtPercent(metrics.actionsCoverage)} |`,
    `| Intents Coverage | ${fmtPercent(metrics.intentsCoverage)} |`,
    `| Relationships Coverage | ${fmtPercent(metrics.relationshipsCoverage)} |`,
    `| Evidence Rules Coverage | ${fmtPercent(metrics.evidenceRulesCoverage)} |`,
    `| Exceptions Coverage | ${fmtPercent(metrics.exceptionsCoverage)} |`,
    `| False Positives Coverage | ${fmtPercent(metrics.falsePositivesCoverage)} |`,
    `| False Negatives Coverage | ${fmtPercent(metrics.falseNegativesCoverage)} |`,
    `| Reviewer Questions Coverage | ${fmtPercent(metrics.reviewerQuestionsCoverage)} |`,
    `| Methodology Coverage | ${fmtPercent(metrics.methodologyCoverage)} |`,
    `| GCAM Mapping Coverage | ${fmtPercent(metrics.gcamMappingCoverage)} |`,
    "",
    "### Topic Coverage",
    renderTopicTable(metrics.topics),
  ];
  return lines.join("\n");
}

export function renderDomainCoverageReport(report: DomainCoverageReport): string {
  return [
    `# Domain Coverage Report — ${report.domainTitle}`,
    "",
    `- Domain: ${report.domainId}`,
    `- Domain Version: ${report.domainVersion}`,
    `- Production Readiness: ${fmtPercent(report.productionReadiness)}`,
    `- Recommendation: ${report.recommendation}`,
    "",
    "## Section Coverage",
    renderSectionTable([
      report.blueprint,
      report.knowledgePack,
      report.lessons,
      report.patterns,
      report.decisionRecords,
      report.benchmarks,
    ]),
    "",
    renderMetrics(report.metrics),
    "",
    renderList("Coverage Gaps", report.coverageGaps),
    "",
    renderList("Critical Gaps", report.criticalGaps),
    "",
    renderList("Warnings", report.warnings),
    "",
    "## Summary",
    `- Production readiness: ${fmtPercent(report.productionReadiness)}`,
    `- Recommendation: ${report.recommendation}`,
    `- Report hash: ${report.hash}`,
  ].join("\n");
}

