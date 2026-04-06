/**
 * Compare two completed analysis jobs to support V1 vs V2 evaluation runs.
 *
 * Usage:
 *   npx tsx src/pipelineV2.compare.ts --job-a <JOB_ID> --job-b <JOB_ID>
 *   npx tsx src/pipelineV2.compare.ts --job-a <JOB_ID> --job-b <JOB_ID> --json
 */
import { supabase } from "./db.js";

type Args = {
  jobA: string;
  jobB: string;
  asJson: boolean;
};

type JobMeta = {
  id: string;
  status: string;
  version_id: string;
  script_id: string;
  config_snapshot?: {
    pipeline_version?: string;
    analysis_profile?: string;
    analysis_engine?: string;
    hybrid_mode?: string;
  } | null;
};

type RawFindingRow = {
  id: string;
  job_id: string;
  article_id: number;
  severity: string | null;
  evidence_snippet: string | null;
  page_number: number | null;
  start_offset_global: number | null;
  end_offset_global: number | null;
  canonical_atom: string | null;
  rationale_ar: string | null;
  location?: {
    v3?: {
      final_ruling?: string | null;
      canonical_finding_id?: string | null;
    } | null;
  } | null;
};

type ReviewFindingRow = {
  job_id: string;
  primary_article_id: number;
  severity: string | null;
  review_status: string | null;
  evidence_snippet: string | null;
  page_number: number | null;
  canonical_finding_id: string | null;
};

function parseArgs(argv: string[]): Args {
  let jobA = "";
  let jobB = "";
  let asJson = false;
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (current === "--job-a") jobA = argv[i + 1] ?? "";
    if (current === "--job-b") jobB = argv[i + 1] ?? "";
    if (current === "--json") asJson = true;
  }
  if (!jobA || !jobB) {
    throw new Error("Usage: npx tsx src/pipelineV2.compare.ts --job-a <JOB_ID> --job-b <JOB_ID> [--json]");
  }
  return { jobA, jobB, asJson };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function shortEvidenceKey(row: {
  evidence_snippet?: string | null;
  article_id?: number;
  primary_article_id?: number;
  page_number?: number | null;
  canonical_finding_id?: string | null;
}): string {
  const article = row.article_id ?? row.primary_article_id ?? 0;
  const evidence = normalizeText(row.evidence_snippet).slice(0, 180);
  const canonical = row.canonical_finding_id ?? "";
  const page = row.page_number ?? "";
  return `${article}|${page}|${canonical}|${evidence}`;
}

function countBy<T extends string | number>(values: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    const key = String(value);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function loadJobMeta(jobId: string): Promise<JobMeta> {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select("id, status, version_id, script_id, config_snapshot")
    .eq("id", jobId)
    .single();
  if (error || !data) throw new Error(`Failed to load job ${jobId}: ${error?.message ?? "not found"}`);
  return data as JobMeta;
}

async function loadRawFindings(jobId: string): Promise<RawFindingRow[]> {
  const { data, error } = await supabase
    .from("analysis_findings")
    .select("id, job_id, article_id, severity, evidence_snippet, page_number, start_offset_global, end_offset_global, canonical_atom, rationale_ar, location")
    .eq("job_id", jobId)
    .order("page_number", { ascending: true })
    .order("start_offset_global", { ascending: true });
  if (error) throw new Error(`Failed to load raw findings for ${jobId}: ${error.message}`);
  return (data ?? []) as RawFindingRow[];
}

async function loadReviewFindings(jobId: string): Promise<ReviewFindingRow[]> {
  const { data, error } = await supabase
    .from("analysis_review_findings")
    .select("job_id, primary_article_id, severity, review_status, evidence_snippet, page_number, canonical_finding_id")
    .eq("job_id", jobId)
    .order("page_number", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? []) as ReviewFindingRow[];
}

function summarizeJob(
  job: JobMeta,
  rawFindings: RawFindingRow[],
  reviewFindings: ReviewFindingRow[],
) {
  const rawByArticle = countBy(rawFindings.map((row) => row.article_id));
  const rawBySeverity = countBy(rawFindings.map((row) => row.severity ?? "unknown"));
  const rawByRuling = countBy(
    rawFindings.map((row) => row.location?.v3?.final_ruling ?? "unruled"),
  );
  const reviewByStatus = countBy(reviewFindings.map((row) => row.review_status ?? "unknown"));
  const reviewBySeverity = countBy(reviewFindings.map((row) => row.severity ?? "unknown"));

  return {
    jobId: job.id,
    status: job.status,
    versionId: job.version_id,
    scriptId: job.script_id,
    pipelineVersion: job.config_snapshot?.pipeline_version ?? "unknown",
    analysisProfile: job.config_snapshot?.analysis_profile ?? "unknown",
    analysisEngine: job.config_snapshot?.analysis_engine ?? "unknown",
    hybridMode: job.config_snapshot?.hybrid_mode ?? "unknown",
    rawFindingCount: rawFindings.length,
    reviewFindingCount: reviewFindings.length,
    rawByArticle,
    rawBySeverity,
    rawByRuling,
    reviewByStatus,
    reviewBySeverity,
  };
}

function compareOverlap(
  leftRaw: RawFindingRow[],
  rightRaw: RawFindingRow[],
  leftReview: ReviewFindingRow[],
  rightReview: ReviewFindingRow[],
) {
  const leftRawKeys = new Set(leftRaw.map((row) => shortEvidenceKey(row)));
  const rightRawKeys = new Set(rightRaw.map((row) => shortEvidenceKey(row)));
  const leftReviewKeys = new Set(leftReview.map((row) => shortEvidenceKey(row)));
  const rightReviewKeys = new Set(rightReview.map((row) => shortEvidenceKey(row)));

  const rawShared = [...leftRawKeys].filter((key) => rightRawKeys.has(key));
  const reviewShared = [...leftReviewKeys].filter((key) => rightReviewKeys.has(key));

  return {
    raw: {
      shared: rawShared.length,
      onlyLeft: [...leftRawKeys].filter((key) => !rightRawKeys.has(key)).slice(0, 15),
      onlyRight: [...rightRawKeys].filter((key) => !leftRawKeys.has(key)).slice(0, 15),
    },
    review: {
      shared: reviewShared.length,
      onlyLeft: [...leftReviewKeys].filter((key) => !rightReviewKeys.has(key)).slice(0, 15),
      onlyRight: [...rightReviewKeys].filter((key) => !leftReviewKeys.has(key)).slice(0, 15),
    },
  };
}

function printHumanSummary(report: {
  left: ReturnType<typeof summarizeJob>;
  right: ReturnType<typeof summarizeJob>;
  overlap: ReturnType<typeof compareOverlap>;
}) {
  const lines = [
    "Pipeline comparison summary",
    "",
    `A: ${report.left.jobId} | pipeline=${report.left.pipelineVersion} | profile=${report.left.analysisProfile} | engine=${report.left.analysisEngine} | hybrid=${report.left.hybridMode}`,
    `   raw=${report.left.rawFindingCount} | review=${report.left.reviewFindingCount}`,
    `B: ${report.right.jobId} | pipeline=${report.right.pipelineVersion} | profile=${report.right.analysisProfile} | engine=${report.right.analysisEngine} | hybrid=${report.right.hybridMode}`,
    `   raw=${report.right.rawFindingCount} | review=${report.right.reviewFindingCount}`,
    "",
    `Raw overlap: shared=${report.overlap.raw.shared} | onlyA=${report.overlap.raw.onlyLeft.length} | onlyB=${report.overlap.raw.onlyRight.length}`,
    `Review overlap: shared=${report.overlap.review.shared} | onlyA=${report.overlap.review.onlyLeft.length} | onlyB=${report.overlap.review.onlyRight.length}`,
    "",
    `A raw rulings: ${JSON.stringify(report.left.rawByRuling)}`,
    `B raw rulings: ${JSON.stringify(report.right.rawByRuling)}`,
    `A review statuses: ${JSON.stringify(report.left.reviewByStatus)}`,
    `B review statuses: ${JSON.stringify(report.right.reviewByStatus)}`,
  ];
  console.log(lines.join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [jobA, jobB] = await Promise.all([loadJobMeta(args.jobA), loadJobMeta(args.jobB)]);
  const [rawA, rawB, reviewA, reviewB] = await Promise.all([
    loadRawFindings(args.jobA),
    loadRawFindings(args.jobB),
    loadReviewFindings(args.jobA),
    loadReviewFindings(args.jobB),
  ]);

  const report = {
    left: summarizeJob(jobA, rawA, reviewA),
    right: summarizeJob(jobB, rawB, reviewB),
    overlap: compareOverlap(rawA, rawB, reviewA, reviewB),
  };

  if (args.asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanSummary(report);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
