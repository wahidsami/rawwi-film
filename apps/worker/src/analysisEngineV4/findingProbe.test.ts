/**
 * Regression tests for the developer-only V4 runtime finding probe.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/findingProbe.test.ts
 */
import { strict as assert } from "node:assert";

import { createSceneAnalysisEngine } from "./sceneAnalysisEngine.js";
import { buildSceneAnalysisTrace, createSceneAnalysisTraceDocument } from "./sceneAnalysisTraceViewer.js";

async function withEnv<T>(env: Readonly<Record<string, string | undefined>>, fn: () => Promise<T> | T): Promise<T> {
  const keys = Object.keys(env);
  const previous = new Map<string, string | undefined>();

  for (const key of keys) {
    previous.set(key, process.env[key]);
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function normalizeForComparison<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;

  const scrub = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        scrub(item);
      }
      return;
    }

    for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
      if (
        key === "executionTimeMs"
        || key === "durationMs"
        || key === "semanticSceneDurationMs"
        || key === "totalMs"
        || key === "startedAt"
        || key === "finishedAt"
        || key.endsWith("ExecutionTimeMs")
        || key.endsWith("DurationMs")
      ) {
        (node as Record<string, unknown>)[key] = 0;
        continue;
      }
      scrub(nested);
    }
  };

  scrub(clone);
  return clone;
}

async function testDisabledProbeProducesNoOutput(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const result = await engine.run("scene-probe-disabled", "حاضر. فهد يتمتم: يا كلب");
  const trace = createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(result));

  assert.equal((trace as { findingProbe?: unknown }).findingProbe ?? null, null);
}

async function testEnabledProbeTracesExactlyOneFinding(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const result = await withEnv({ DEBUG_FINDING_TEXT: "حاضر. فهد يتمتم: يا كلب" }, () => engine.run("scene-probe-enabled", "حاضر. فهد يتمتم: يا كلب"));
  const trace = await withEnv({ DEBUG_FINDING_TEXT: "حاضر. فهد يتمتم: يا كلب" }, () => createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(result)));
  const probe = (trace as { findingProbe?: { steps: readonly { nodeName: string }[]; selection: { matchedBy: string | null } } }).findingProbe;

  assert.ok(probe);
  assert.equal(probe?.selection.matchedBy, "finding_text");
  assert.equal(probe?.steps.length > 0, true);
  assert.equal(probe?.steps[0] !== undefined, true);
  assert.equal(probe?.steps.every((step) => typeof step.nodeName === "string"), true);
}

async function testRuntimeBehaviorIsUnchanged(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const baseline = await withEnv({}, () => engine.run("scene-probe-compare", "حاضر. فهد يتمتم: يا كلب"));
  const probed = await withEnv({ DEBUG_FINDING_TEXT: "حاضر. فهد يتمتم: يا كلب" }, () => engine.run("scene-probe-compare", "حاضر. فهد يتمتم: يا كلب"));

  assert.deepStrictEqual(normalizeForComparison(probed), normalizeForComparison(baseline));
}

async function main(): Promise<void> {
  await testDisabledProbeProducesNoOutput();
  console.log("✓ disabled probe produces no output");
  await testEnabledProbeTracesExactlyOneFinding();
  console.log("✓ enabled probe traces one finding");
  await testRuntimeBehaviorIsUnchanged();
  console.log("✓ runtime behavior is unchanged");
  console.log("\nAll V4 finding probe tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
