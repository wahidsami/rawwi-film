import assert from "node:assert/strict";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

async function loadPipelineHelpers() {
  const module = await import("./pipeline.js");
  return {
    shouldApplyPersistenceFiltersForEngine: module.shouldApplyPersistenceFiltersForEngine as typeof import("./pipeline.js").shouldApplyPersistenceFiltersForEngine,
    shouldRunValidatedTruthPipelineForEngine: module.shouldRunValidatedTruthPipelineForEngine as typeof import("./pipeline.js").shouldRunValidatedTruthPipelineForEngine,
  };
}

async function testReviewCoreBypassesLegacyPersistenceFiltersAsync(): Promise<void> {
  const { shouldApplyPersistenceFiltersForEngine } = await loadPipelineHelpers();
  assert.equal(shouldApplyPersistenceFiltersForEngine("review_core"), false, "review_core must bypass legacy persistence filters");
  assert.equal(shouldApplyPersistenceFiltersForEngine("v3"), true, "v3 must continue to use persistence filters");
  assert.equal(shouldApplyPersistenceFiltersForEngine("v4"), true, "v4 must continue to use persistence filters");
}

async function testReviewCoreBypassesValidatedTruthPipelineAsync(): Promise<void> {
  const { shouldRunValidatedTruthPipelineForEngine } = await loadPipelineHelpers();
  assert.equal(
    shouldRunValidatedTruthPipelineForEngine("review_core", "enforce", true),
    false,
    "review_core must bypass the validated truth / deep auditor path",
  );
  assert.equal(
    shouldRunValidatedTruthPipelineForEngine("v3", "off", true),
    true,
    "v3 must continue to honor the validated truth pipeline when enabled",
  );
  assert.equal(
    shouldRunValidatedTruthPipelineForEngine("v4", "off", true),
    true,
    "v4 must continue to honor the validated truth pipeline when enabled",
  );
  assert.equal(
    shouldRunValidatedTruthPipelineForEngine("hybrid", "enforce", false),
    true,
    "hybrid mode must continue to enter validated truth processing when enabled by mode",
  );
}

async function main(): Promise<void> {
  await testReviewCoreBypassesLegacyPersistenceFiltersAsync();
  await testReviewCoreBypassesValidatedTruthPipelineAsync();
  console.log("✓ review_core post-processing gates behave as expected");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
