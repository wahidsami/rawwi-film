import assert from "node:assert/strict";

import { resolveRequestedAnalysisEngine, resolveRequestedPipelineVersion } from "./analysisEngineSelection.js";

function testEnvShadowSelectsShadow(): void {
  assert.equal(resolveRequestedAnalysisEngine(undefined, "shadow"), "shadow");
}

function testEnvV4SelectsV4(): void {
  assert.equal(resolveRequestedAnalysisEngine(undefined, "v4"), "v4");
}

function testEnvV3RemainsV3(): void {
  assert.equal(resolveRequestedAnalysisEngine(undefined, "v3"), "v3");
}

function testPipelineDefaultsStayStable(): void {
  const engine = resolveRequestedAnalysisEngine(undefined, "shadow");
  assert.equal(resolveRequestedPipelineVersion(undefined, "balanced", engine, "v2"), "v2");
}

function main(): void {
  testEnvShadowSelectsShadow();
  testEnvV4SelectsV4();
  testEnvV3RemainsV3();
  testPipelineDefaultsStayStable();
  console.log("✓ task analysis engine selection tests passed");
}

main();
