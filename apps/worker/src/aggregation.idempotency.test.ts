import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function testAggregationReportIsPersistedOnce(
  persistAggregationReportOnceFn: (
    jobId: string,
    reportRow: Record<string, unknown>,
    store: {
      findReportIdByJobId(jobId: string): Promise<string | null>;
      insertReportOnce(jobId: string, reportRow: Record<string, unknown>): Promise<string | null>;
    }
  ) => Promise<{ inserted: boolean; reportId: string | null }>,
) {
  let reportId: string | null = null;
  let insertCalls = 0;

  const store = {
    async findReportIdByJobId(_jobId: string): Promise<string | null> {
      return reportId;
    },
    async insertReportOnce(jobId: string, _reportRow: Record<string, unknown>): Promise<string | null> {
      insertCalls += 1;
      if (reportId) return null;
      reportId = `${jobId}-report`;
      return reportId;
    },
  };

  return persistAggregationReportOnceFn("job-1", { job_id: "job-1" }, store).then(async (first) => {
    assert.equal(first.inserted, true);
    assert.equal(first.reportId, "job-1-report");
    assert.equal(insertCalls, 1);

    const second = await persistAggregationReportOnceFn("job-1", { job_id: "job-1" }, store);
    assert.equal(second.inserted, false);
    assert.equal(second.reportId, "job-1-report");
    assert.equal(insertCalls, 1, "report persistence should happen only once");
  });
}

function testStaleRecoveryHasOneAuthoritativePath() {
  const sourcePath = join(process.cwd(), "apps", "worker", "src", "index.ts");
  const source = readFileSync(sourcePath, "utf8");

  const processStart = source.indexOf("async function processOneJob()");
  const sweepStart = source.indexOf("function startStaleJudgingSweep()");
  const runOnceStart = source.indexOf("async function runOnce(jobId: string | undefined): Promise<void>");
  assert.ok(processStart >= 0, "processOneJob should exist");
  assert.ok(sweepStart > processStart, "startStaleJudgingSweep should exist after processOneJob");
  assert.ok(runOnceStart > sweepStart, "runOnce should exist after startStaleJudgingSweep");

  const processBody = source.slice(processStart, sweepStart);
  assert.equal(
    processBody.includes("recoverStaleJudgingChunks("),
    false,
    "processOneJob should not run stale recovery directly",
  );

  const sweepBody = source.slice(sweepStart, runOnceStart);
  const recoveryCallCount = (sweepBody.match(/recoverStaleJudgingChunks\(/g) ?? []).length;
  assert.equal(recoveryCallCount, 1, "startStaleJudgingSweep should own the only recovery call path");
  assert.equal(sweepBody.includes("void sweep();"), true, "watchdog should run immediately on startup");
}

async function main() {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

  const { persistAggregationReportOnce } = await import("./aggregation.js");
  await testAggregationReportIsPersistedOnce(persistAggregationReportOnce);
  testStaleRecoveryHasOneAuthoritativePath();
  console.log("✓ Aggregation persistence is idempotent and stale recovery has one authoritative path");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
