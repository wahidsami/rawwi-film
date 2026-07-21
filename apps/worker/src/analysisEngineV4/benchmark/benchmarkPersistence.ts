import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { BenchmarkReport } from "./benchmarkTypes.js";

export type BenchmarkPersistenceOptions = Readonly<{
  markdownPath?: string | null;
  reportPath?: string | null;
  tracePath?: string | null;
}>;

export type BenchmarkPersistenceResult = Readonly<{
  markdownPath: string | null;
  reportPath: string | null;
  tracePath: string | null;
}>;

async function writeIfRequested(pathname: string | null | undefined, content: string): Promise<string | null> {
  if (!pathname) return null;
  const resolved = resolve(pathname);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf8");
  return resolved;
}

export async function persistBenchmarkReport(report: BenchmarkReport, options: BenchmarkPersistenceOptions = {}): Promise<BenchmarkPersistenceResult> {
  const markdownPath = await writeIfRequested(options.markdownPath, report.markdown);
  const reportPath = await writeIfRequested(options.reportPath, JSON.stringify(report, null, 2));
  const tracePath = await writeIfRequested(options.tracePath, JSON.stringify(report.cases.map((item) => item.traceDocument), null, 2));

  return Object.freeze({
    markdownPath,
    reportPath,
    tracePath,
  });
}
