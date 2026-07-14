/**
 * Tests for the V3 automatic fallback wrapper.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/automaticFallback.test.ts
 */
import { strict as assert } from "node:assert";
import { runWithV3AutomaticFallback, type V3AutomaticFallbackDiagnostics } from "./automaticFallback.js";
import {
  getV3FallbackExecutionCount,
  resetV3FallbackExecutionCount,
} from "./runtimeMetrics.js";

async function testEnabledFallbackRecoversWithDiagnostics(): Promise<void> {
  resetV3FallbackExecutionCount();

  let onFallbackDiagnostics: V3AutomaticFallbackDiagnostics | null = null;

  const result = await runWithV3AutomaticFallback({
    enabled: true,
    runPrimary: async () => {
      throw new Error("synthetic V3 failure");
    },
    onFallback: async (diagnostics) => {
      onFallbackDiagnostics = diagnostics;
    },
    runFallback: async (diagnostics) => {
      assert.equal(diagnostics.engineAttempted, "v3");
      assert.equal(diagnostics.engineUsed, "v2_fallback");
      assert.equal(diagnostics.fallbackReason, "synthetic V3 failure");
      assert.ok(diagnostics.exceptionStack?.includes("synthetic V3 failure"));
      return "v2-result";
    },
  });

  assert.equal(result, "v2-result");
  assert.ok(onFallbackDiagnostics, "fallback diagnostics should be captured");
  const fallbackDiagnostics = onFallbackDiagnostics as V3AutomaticFallbackDiagnostics;
  assert.equal(fallbackDiagnostics.engineAttempted, "v3");
  assert.equal(fallbackDiagnostics.engineUsed, "v2_fallback");
  assert.equal(fallbackDiagnostics.fallbackReason, "synthetic V3 failure");
  assert.ok(fallbackDiagnostics.exceptionStack?.includes("synthetic V3 failure"));
  assert.equal(getV3FallbackExecutionCount(), 0);
}

async function testDisabledFallbackPropagates(): Promise<void> {
  resetV3FallbackExecutionCount();

  let onFallbackCalled = false;

  await assert.rejects(
    async () =>
      runWithV3AutomaticFallback({
        enabled: false,
        runPrimary: async () => {
          throw new Error("disabled path failure");
        },
        onFallback: async () => {
          onFallbackCalled = true;
        },
        runFallback: async () => "should-not-run",
      }),
    /disabled path failure/,
  );

  assert.equal(onFallbackCalled, false);
}

async function main(): Promise<void> {
  await testEnabledFallbackRecoversWithDiagnostics();
  await testDisabledFallbackPropagates();
  console.log("✓ V3 automatic fallback wrapper behaves correctly");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
