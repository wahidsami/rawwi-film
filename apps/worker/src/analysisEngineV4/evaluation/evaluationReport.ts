import type { BenchmarkEngineComparison, BenchmarkScreenplay } from "../benchmark/benchmarkTypes.js";
import type { CohenKappaResult } from "./interRaterAgreement.js";
import type { ReviewScore } from "./reviewScoring.js";

export type EvaluationParticipantRole = "human" | "v3" | "v4";

export type BlindAssignment = Readonly<Record<EvaluationParticipantRole, string>>;

export type EvaluationCaseResult = Readonly<{
  screenplayId: string;
  sceneId: string;
  sceneSummary: string;
  blindAssignment: BlindAssignment;
  humanFindings: BenchmarkScreenplay["expectedFindings"];
  humanScore: ReviewScore;
  v3Comparison: BenchmarkEngineComparison;
  v4Comparison: BenchmarkEngineComparison;
  v3Score: ReviewScore;
  v4Score: ReviewScore;
  pairwiseAgreement: Readonly<{
    humanVsV3: CohenKappaResult;
    humanVsV4: CohenKappaResult;
    v3VsV4: CohenKappaResult;
  }>;
}>;

export type EvaluationReport = Readonly<{
  sessionId: string;
  blindLabels: readonly string[];
  cases: readonly EvaluationCaseResult[];
  participantScores: Readonly<{
    human: ReviewScore;
    v3: ReviewScore;
    v4: ReviewScore;
  }>;
  pairwiseAgreement: Readonly<{
    humanVsV3: CohenKappaResult;
    humanVsV4: CohenKappaResult;
    v3VsV4: CohenKappaResult;
  }>;
  metrics: Readonly<{
    precision: number;
    recall: number;
    f1: number;
    cohenKappa: number;
    falsePositiveCount: number;
    falseNegativeCount: number;
  }>;
  markdown: string;
}>;

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function renderScore(title: string, score: ReviewScore): string[] {
  return [
    `- ${title}:`,
    `  - Precision: ${format(score.precision)}`,
    `  - Recall: ${format(score.recall)}`,
    `  - F1: ${format(score.f1)}`,
    `  - False positives: ${format(score.falsePositiveCount)}`,
    `  - False negatives: ${format(score.falseNegativeCount)}`,
    `  - False positive rate: ${format(score.falsePositiveRate)}`,
    `  - False negative rate: ${format(score.falseNegativeRate)}`,
  ];
}

function renderKappa(title: string, value: CohenKappaResult): string[] {
  return [
    `- ${title}:`,
    `  - Cohen's Kappa: ${format(value.kappa)}`,
    `  - Observed agreement: ${format(value.observedAgreement)}`,
    `  - Expected agreement: ${format(value.expectedAgreement)}`,
    `  - Disagreement count: ${format(value.disagreementCount)}`,
  ];
}

export function createEvaluationReport(report: EvaluationReport): EvaluationReport {
  return Object.freeze({
    ...report,
    blindLabels: Object.freeze([...report.blindLabels]),
    cases: Object.freeze([...report.cases]),
    participantScores: Object.freeze({
      ...report.participantScores,
    }),
    pairwiseAgreement: Object.freeze({
      ...report.pairwiseAgreement,
    }),
    metrics: Object.freeze({
      ...report.metrics,
    }),
  });
}

export function renderEvaluationReportMarkdown(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push("# V4 Human Evaluation Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Session ID: ${report.sessionId}`);
  lines.push(`- Blind labels: ${report.blindLabels.join(", ")}`);
  lines.push(`- Cases: ${report.cases.length}`);
  lines.push(`- Precision: ${format(report.metrics.precision)}`);
  lines.push(`- Recall: ${format(report.metrics.recall)}`);
  lines.push(`- F1: ${format(report.metrics.f1)}`);
  lines.push(`- Cohen's Kappa: ${format(report.metrics.cohenKappa)}`);
  lines.push(`- False positives: ${format(report.metrics.falsePositiveCount)}`);
  lines.push(`- False negatives: ${format(report.metrics.falseNegativeCount)}`);
  lines.push("");
  lines.push("## Blind Comparison");
  for (const item of report.cases) {
    lines.push(`### ${item.screenplayId} / ${item.sceneId}`);
    lines.push(`- Human label: ${item.blindAssignment.human}`);
    lines.push(`- V3 label: ${item.blindAssignment.v3}`);
    lines.push(`- V4 label: ${item.blindAssignment.v4}`);
    lines.push(`- Scene summary: ${item.sceneSummary}`);
    lines.push(`- Human findings: ${item.humanFindings.length}`);
    lines.push(`- V3 finding comparisons: ${item.v3Comparison.findingComparisons.length}`);
    lines.push(`- V4 finding comparisons: ${item.v4Comparison.findingComparisons.length}`);
    lines.push("");
  }
  lines.push("## Participant Scores");
  for (const line of renderScore("Human", report.participantScores.human)) lines.push(line);
  for (const line of renderScore("V3", report.participantScores.v3)) lines.push(line);
  for (const line of renderScore("V4", report.participantScores.v4)) lines.push(line);
  lines.push("");
  lines.push("## Pairwise Agreement");
  for (const line of renderKappa("Human vs V3", report.pairwiseAgreement.humanVsV3)) lines.push(line);
  for (const line of renderKappa("Human vs V4", report.pairwiseAgreement.humanVsV4)) lines.push(line);
  for (const line of renderKappa("V3 vs V4", report.pairwiseAgreement.v3VsV4)) lines.push(line);
  lines.push("");
  return lines.join("\n");
}
