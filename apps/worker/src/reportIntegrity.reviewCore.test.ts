import assert from "node:assert/strict";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

async function loadAggregationHelpers() {
  const module = await import("./aggregation.js");
  return {
    shouldBypassReportIntegrityValidationForEngine: module.shouldBypassReportIntegrityValidationForEngine as typeof import("./aggregation.js").shouldBypassReportIntegrityValidationForEngine,
    resolveAggregationAnalysisEngine: module.resolveAggregationAnalysisEngine as typeof import("./aggregation.js").resolveAggregationAnalysisEngine,
  };
}

async function testReviewCoreBypassesReportIntegrityValidation(): Promise<void> {
  const { resolveAggregationAnalysisEngine, shouldBypassReportIntegrityValidationForEngine } = await loadAggregationHelpers();
  assert.equal(resolveAggregationAnalysisEngine("v3", "review_core"), "review_core");
  assert.equal(shouldBypassReportIntegrityValidationForEngine(resolveAggregationAnalysisEngine("v3", "review_core")), true);
  assert.equal(resolveAggregationAnalysisEngine("v3", "v3"), "v3");
  assert.equal(shouldBypassReportIntegrityValidationForEngine("v3"), false);
  assert.equal(shouldBypassReportIntegrityValidationForEngine("v4"), false);
  assert.equal(shouldBypassReportIntegrityValidationForEngine("shadow"), false);
}

async function main(): Promise<void> {
  await testReviewCoreBypassesReportIntegrityValidation();
  console.log("✓ review_core bypasses report integrity validation gates");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
