import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createSceneAnalysisEngine, type SceneAnalysisEngine } from "../sceneAnalysisEngine.js";
import type { SceneAnalysisState, SceneAnalysisTrace } from "../sceneAnalysisState.js";
import {
  buildSceneAnalysisTrace,
  createSceneAnalysisTraceDocument,
  
  type SceneAnalysisTraceDocument,
} from "../sceneAnalysisTraceViewer.js";

export type SceneAnalysisBenchmarkCase = Readonly<{
  id: string;
  sceneId: string;
  sceneText: string;
}>;

export type SceneAnalysisBenchmarkCaseResult = Readonly<{
  case: SceneAnalysisBenchmarkCase;
  state: SceneAnalysisState;
  trace: SceneAnalysisTrace;
  traceDocument: SceneAnalysisTraceDocument;
}>;

export type SceneAnalysisBenchmarkReport = Readonly<{
  generatedAt: string;
  cases: readonly SceneAnalysisBenchmarkCaseResult[];
  traceFilePath: string | null;
}>;

export type SceneAnalysisBenchmarkOptions = Readonly<{
  engine?: SceneAnalysisEngine;
  traceFilePath?: string | null;
}>;

async function persistBenchmarkTraceDocument(
  traceFilePath: string,
  report: SceneAnalysisBenchmarkReport,
): Promise<string> {
  const resolved = resolve(traceFilePath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return resolved;
}

export async function runSceneAnalysisBenchmark(
  cases: readonly SceneAnalysisBenchmarkCase[],
  options: SceneAnalysisBenchmarkOptions = {},
): Promise<SceneAnalysisBenchmarkReport> {
  const engine = options.engine ?? createSceneAnalysisEngine();
  const results: SceneAnalysisBenchmarkCaseResult[] = [];

  for (const benchmarkCase of cases) {
    const state = await engine.run(benchmarkCase.sceneId, benchmarkCase.sceneText);
    const trace = buildSceneAnalysisTrace(state);
    const traceDocument = createSceneAnalysisTraceDocument(trace);
    results.push(Object.freeze({
      case: benchmarkCase,
      state,
      trace,
      traceDocument,
    }));
  }

  const report = Object.freeze({
    generatedAt: new Date().toISOString(),
    cases: Object.freeze(results),
    traceFilePath: options.traceFilePath ?? null,
  });

  if (options.traceFilePath) {
    await persistBenchmarkTraceDocument(options.traceFilePath, report);
  }

  return report;
}
