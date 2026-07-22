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

function testAggregationAbortsBeforeReportWhenJobFailed() {
  const sourcePath = join(process.cwd(), "apps", "worker", "src", "aggregation.ts");
  const source = readFileSync(sourcePath, "utf8");

  const runAggregationStart = source.indexOf("export async function runAggregation(jobId: string): Promise<void>");
  const reportPersistIndex = source.indexOf("persistAggregationReportOnce(jobId, reportRow)", runAggregationStart);
  const runAggregationBody = runAggregationStart >= 0 && reportPersistIndex > runAggregationStart
    ? source.slice(runAggregationStart, reportPersistIndex)
    : source.slice(runAggregationStart);
  const failedGateIndex = runAggregationBody.indexOf("if (jobStatus === \"failed\")");
  const findingsLoadIndex = runAggregationBody.indexOf(".from(\"analysis_findings\")");

  assert.ok(runAggregationStart >= 0, "runAggregation should exist");
  assert.ok(reportPersistIndex > runAggregationStart, "runAggregation should reach report persistence after the failed-job gate");
  assert.ok(failedGateIndex >= 0, "runAggregation should inspect job status at entry");
  assert.ok(failedGateIndex < findingsLoadIndex, "failed-job gate must run before loading findings");
  assert.equal(runAggregationBody.includes("persistAggregationReportOnce(jobId, reportRow)"), false, "report persistence should not appear before the failed-job gate slice");
  assert.equal(source.includes("Aggregation aborted because job is already failed"), true, "aggregation should log the abort reason");
}

async function main() {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

  const { persistAggregationReportOnce, persistReviewFindingRows, verifyReportContract } = await import("./aggregation.js");
  await testAggregationReportIsPersistedOnce(persistAggregationReportOnce);
  await testReviewerFindingMaterializationIsIdempotent(persistReviewFindingRows);
  await testReportContractVerifier(verifyReportContract);
  testStaleRecoveryHasOneAuthoritativePath();
  testAggregationAbortsBeforeReportWhenJobFailed();
  console.log("✓ Aggregation persistence is idempotent, reviewer findings materialization is idempotent, stale recovery has one authoritative path, and failed jobs abort aggregation before report generation");
}

async function testReportContractVerifier(
  verifyReportContractFn: (...args: any[]) => Promise<{ reportCount: number }>,
) {
  const passingStore = {
    async listReportsByJobId(_jobId: string): Promise<Array<Record<string, unknown>>> {
      return [
        {
          id: "report-1",
          analysis_generation_id: "generation-1",
          report_generation_id: "generation-1",
        },
      ];
    },
  };

  const passing = await verifyReportContractFn({
    jobId: "job-contract-pass",
    generationId: "generation-1",
    findingCount: 3,
    pipelineIntegrityStatus: "passed",
    atpStatus: "passed",
    reportInserted: true,
    reportId: "report-1",
    store: passingStore,
  });
  assert.equal(passing.reportCount, 1, "successful analysis with findings should have exactly one report");

  const failingStore = {
    async listReportsByJobId(_jobId: string): Promise<Array<Record<string, unknown>>> {
      return [];
    },
  };

  await assert.rejects(
    () => verifyReportContractFn({
      jobId: "job-contract-fail",
      generationId: "generation-2",
      findingCount: 2,
      pipelineIntegrityStatus: "passed",
      atpStatus: "passed",
      reportInserted: false,
      reportId: null,
      store: failingStore,
    }),
    (error: unknown) => {
      const contractError = error as { name?: string; message?: string; diagnostic?: { errorCode?: string; reportCount?: number } };
      assert.equal(contractError.name, "REPORT_CONTRACT_VIOLATION");
      assert.equal(contractError.message, "REPORT_CONTRACT_VIOLATION");
      assert.equal(contractError.diagnostic?.errorCode, "REPORT_CONTRACT_VIOLATION");
      assert.equal(contractError.diagnostic?.reportCount, 0);
      return true;
    },
  );
}

async function testReviewerFindingMaterializationIsIdempotent(
  persistReviewFindingRowsFn: (...args: any[]) => Promise<void>,
) {
  const storedRows = new Map<string, Array<Record<string, unknown>>>();
  let deleteCalls = 0;
  let upsertCalls = 0;

  const store = {
    async deleteCurrentReviewFindings(reportId: string): Promise<void> {
      deleteCalls += 1;
      storedRows.set(reportId, []);
    },
    async upsertCurrentReviewFindings(reportId: string, rows: Array<Record<string, unknown>>): Promise<void> {
      upsertCalls += 1;
      const current = storedRows.get(reportId) ?? [];
      const merged = new Map<string, Record<string, unknown>>();
      for (const row of current) {
        const key = String(row.canonical_finding_id ?? "");
        if (!key) continue;
        merged.set(key, row);
      }
      for (const row of rows) {
        const key = String(row.canonical_finding_id ?? "");
        if (!key) {
          throw new Error("review findings must have deterministic canonical ids");
        }
        merged.set(key, row);
      }
      storedRows.set(reportId, [...merged.values()]);
    },
  };

  const rows: Array<Record<string, unknown>> = [
    {
      report_id: "report-1",
      job_id: "job-1",
      canonical_finding_id: "finding-1",
      source_kind: "ai",
      primary_article_id: 11,
      primary_atom_id: "11-1",
      severity: "high",
      review_status: "violation",
      title_ar: "عنوان",
      description_ar: null,
      rationale_ar: null,
      evidence_snippet: "طز فيكم",
      manual_comment: null,
      page_number: 1,
      start_offset_global: 10,
      end_offset_global: 18,
      start_offset_page: null,
      end_offset_page: null,
      anchor_status: "exact",
      anchor_method: "canonical_summary",
      anchor_text: "طز فيكم",
      anchor_confidence: 1,
      is_manual: false,
      is_hidden: false,
      include_in_report: true,
      created_from_job_id: "job-1",
      script_id: "script-1",
      version_id: "version-1",
    },
  ];

  await persistReviewFindingRowsFn("report-1", "job-1", rows, store);
  await persistReviewFindingRowsFn("report-1", "job-1", rows, store);

  const finalRows = storedRows.get("report-1") ?? [];
  assert.equal(finalRows.length, 1);
  assert.equal(deleteCalls, 2);
  assert.equal(upsertCalls, 2);
  assert.equal(String(finalRows[0]?.canonical_finding_id ?? ""), "finding-1");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
