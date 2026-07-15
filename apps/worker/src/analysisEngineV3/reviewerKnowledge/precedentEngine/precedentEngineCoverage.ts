import { hashDecisionMemoryValue } from "../decisionMemory/decisionMemoryUtils.js";
import type { PrecedentEngineReport } from "./precedentEngineTypes.js";

export function createPrecedentEngineCoverageReport(report: PrecedentEngineReport): PrecedentEngineReport {
  return report;
}

export function renderPrecedentEngineReport(report: PrecedentEngineReport): string {
  const lines = [
    "# GCAM Reviewer Precedent Engine",
    `- Total Decisions: ${report.totalDecisions}`,
    `- Total Cases: ${report.totalCases}`,
    `- Precedent Coverage: ${Math.round(report.precedentCoverage * 100)}%`,
    `- Best Match: ${report.bestMatch ? `${report.bestMatch.decision.id} (${Math.round(report.bestMatch.similarity * 100)}%)` : "None"}`,
  ];

  if (report.matches.length > 0) {
    lines.push("", "## Top Matches");
    for (const match of report.matches.slice(0, 5)) {
      lines.push(`- ${match.decision.id} | ${Math.round(match.similarity * 100)}% | ${match.reason}`);
    }
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}

export function hashPrecedentEngineReport(report: PrecedentEngineReport): string {
  return hashDecisionMemoryValue(report);
}
