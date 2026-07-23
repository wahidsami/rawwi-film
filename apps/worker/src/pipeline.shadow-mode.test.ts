import assert from "node:assert/strict";

async function main(): Promise<void> {
  process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
  process.env.OPENAI_API_KEY ||= "test-openai-key";

  const pipeline = await import("./pipeline.js");
  const { resolveAnalysisEngineForJob, shouldRunV4ShadowMode } = pipeline;

  const shadowEngine = resolveAnalysisEngineForJob({ analysis_engine: "shadow" }, "v2");
  assert.equal(shadowEngine, "shadow");
  assert.equal(shouldRunV4ShadowMode(shadowEngine), true);

  const defaultEngine = resolveAnalysisEngineForJob({}, "v2");
  assert.equal(defaultEngine, "review_core");
  assert.equal(shouldRunV4ShadowMode(defaultEngine), false);

  const v4Engine = resolveAnalysisEngineForJob({ analysis_engine: "v4" }, "v2");
  assert.equal(v4Engine, "v4");
  assert.equal(shouldRunV4ShadowMode(v4Engine), false);

  const v3Engine = resolveAnalysisEngineForJob({ analysis_engine: "v3" }, "v2");
  assert.equal(v3Engine, "v3");
  assert.equal(shouldRunV4ShadowMode(v3Engine), false);

  console.log("✓ pipeline shadow mode selection tests passed");
}

main();
