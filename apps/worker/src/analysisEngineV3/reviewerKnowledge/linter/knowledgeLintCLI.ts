#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { lintAcademyDirectory, lintAcademyPackFile, lintAcademyFileInDirectory } from "./knowledgeLinter.js";
import { serializeKnowledgeLintReport } from "./knowledgeLintReport.js";

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function printReadable(report: ReturnType<typeof lintAcademyPackFile>, label: string): void {
  console.log(`Knowledge Lint Report: ${label}`);
  console.log(`Ready for Academy: ${report.overallScore.readyForAcademy ? "yes" : "no"}`);
  console.log(`Score: ${report.overallScore.score}`);
  console.log(`Pack Score: ${report.packScore.score}`);
  console.log(`Coverage: ${report.statistics.coveragePercentage}%`);
  console.log(`Errors: ${report.errors.length}`);
  console.log(`Warnings: ${report.warnings.length}`);
  if (report.errors.length > 0) {
    console.log("Errors:");
    report.errors.forEach((issue) => console.log(`- [${issue.code}] ${issue.path}: ${issue.message}`));
  }
  if (report.warnings.length > 0) {
    console.log("Warnings:");
    report.warnings.forEach((issue) => console.log(`- [${issue.code}] ${issue.path}: ${issue.message}`));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const readable = args.includes("--readable") || !json;
  const target = args.find((arg) => !arg.startsWith("--")) ?? ".";

  if (target === "academy" || target.endsWith("/academy") || target.endsWith("\\academy")) {
    const registry = lintAcademyDirectory(target);
    const payload = registry.list().map((entry) => entry.report);
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    payload.forEach((report) => printReadable(report, report.metadata.id));
    return;
  }

  if (isDirectory(target)) {
    const registry = lintAcademyDirectory(target);
    const payload = registry.list().map((entry) => entry.report);
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    payload.forEach((report) => printReadable(report, report.metadata.id));
    return;
  }

  const report = lintAcademyPackFile(target);
  if (json) {
    console.log(serializeKnowledgeLintReport(report));
    return;
  }
  if (readable) {
    printReadable(report, basename(target));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

