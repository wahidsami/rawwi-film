import assert from "node:assert/strict";

function testIntegrityReportPassesForMatchingIds() {
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
}

async function loadBuildPipelineIntegrityReport() {
  testIntegrityReportPassesForMatchingIds();
  const module = await import("./aggregation.js");
  return module.buildPipelineIntegrityReport as typeof import("./aggregation.js").buildPipelineIntegrityReport;
}

async function testIntegrityReportPassesForMatchingIdsAsync() {
  const buildPipelineIntegrityReport = await loadBuildPipelineIntegrityReport();
  const report = buildPipelineIntegrityReport({
    jobId: "job-1",
    reportId: "report-1",
    findings: [
      {
        lineage_id: "line-1",
        canonical_hash: "canon-1",
        evidence_hash: "evidence-1",
        article_id: 11,
        atom_id: "11-1",
        evidence_snippet: "طز فيكم",
        start_offset_global: 10,
        end_offset_global: 16,
      } as never,
    ],
    reviewFindings: [
      {
        id: "review-1",
        canonical_finding_id: "line-1",
        source_kind: "ai",
        primary_article_id: 11,
        primary_atom_id: "11-1",
        evidence_snippet: "طز فيكم",
        review_status: "violation",
        is_manual: false,
      },
      {
        id: "review-manual-1",
        canonical_finding_id: "manual-1",
        source_kind: "manual",
        primary_article_id: 11,
        primary_atom_id: "11-1",
        evidence_snippet: "ملاحظة يدوية",
        review_status: "violation",
        is_manual: true,
      },
    ],
    summary: {
      job_id: "job-1",
      script_id: "script-1",
      generated_at: "2026-07-22T00:00:00.000Z",
      totals: {
        findings_count: 1,
        severity_counts: { low: 0, medium: 0, high: 1, critical: 0 },
      },
      checklist_articles: [],
      findings_by_article: [],
      canonical_findings: [
        {
          canonical_finding_id: "line-1",
          title_ar: "title",
          evidence_snippet: "طز فيكم",
          severity: "high",
          confidence: 0.9,
        },
      ],
      report_hints: [],
      manual_review_context: {
        carried_forward_count: 1,
        items: [
          {
            article_id: 11,
            severity: "medium",
            evidence_snippet: "ملاحظة يدوية",
          },
        ],
      },
    },
    reportRow: {
      findings_count: 1,
    },
  });

  assert.deepEqual(report.mismatches, [], "Integrity report should pass for matching data");
  assert.ok(report.evaluations.length >= 7, `Expected all pipeline integrity rules to be evaluated, got ${report.evaluations.length}`);
  assert.ok(report.evaluations.every((evaluation) => evaluation.status === "PASS"), "All pipeline integrity evaluations should pass");
}

async function testIntegrityReportDetectsDivergenceAsync() {
  const buildPipelineIntegrityReport = await loadBuildPipelineIntegrityReport();
  const report = buildPipelineIntegrityReport({
    jobId: "job-1",
    reportId: "report-1",
    findings: [
      {
        lineage_id: "line-1",
        canonical_hash: "canon-1",
        evidence_hash: "evidence-1",
        article_id: 11,
        atom_id: "11-1",
        evidence_snippet: "طز فيكم",
        start_offset_global: 10,
        end_offset_global: 16,
      } as never,
    ],
    reviewFindings: [],
    summary: {
      job_id: "job-1",
      script_id: "script-1",
      generated_at: "2026-07-22T00:00:00.000Z",
      totals: {
        findings_count: 2,
        severity_counts: { low: 0, medium: 0, high: 1, critical: 0 },
      },
      checklist_articles: [],
      findings_by_article: [],
      canonical_findings: [
        {
          canonical_finding_id: "other-line",
          title_ar: "title",
          evidence_snippet: "different evidence",
          severity: "high",
          confidence: 0.9,
        },
      ],
      report_hints: [],
    },
    reportRow: {
      findings_count: 2,
    },
  });

  assert.ok(report.mismatches.length > 0, "Integrity report should detect mismatches");
  assert.ok(report.evaluations.some((evaluation) => evaluation.status === "FAIL"), "Divergent pipeline integrity report should include failing evaluations");
}

async function main() {
  await testIntegrityReportPassesForMatchingIdsAsync();
  await testIntegrityReportDetectsDivergenceAsync();
  console.log("✓ Pipeline integrity report validates identity consistency");
}

main();
