import { writeFile } from "node:fs/promises";

import { supabase } from "../../db.js";
import { buildProvenanceReport, renderProvenanceReportMarkdown, type ProvenanceChunkRun, type ProvenanceReportInput } from "../provenance/findingProvenanceReport.js";

type RecordLike = Readonly<Record<string, unknown>>;

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: readonly string[]): Readonly<{
  jobId: string | null;
  output: string | null;
  findingId: string | null;
}> {
  let jobId: string | null = null;
  let output: string | null = null;
  let findingId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--job-id" || arg === "--job") {
      jobId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--job-id=")) {
      jobId = arg.slice("--job-id=".length) || null;
      continue;
    }
    if (arg.startsWith("--job=")) {
      jobId = arg.slice("--job=".length) || null;
      continue;
    }
    if (arg === "--output") {
      output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length) || null;
      continue;
    }
    if (arg === "--finding-id") {
      findingId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--finding-id=")) {
      findingId = arg.slice("--finding-id=".length) || null;
      continue;
    }
  }

  return freeze({
    jobId,
    output,
    findingId,
  });
}

async function loadChunkRuns(jobId: string): Promise<readonly ProvenanceChunkRun[]> {
  const { data, error } = await supabase
    .from("analysis_chunk_runs")
    .select("job_id, run_key, truth_layer_meta")
    .eq("job_id", jobId)
    .order("run_key", { ascending: true });

  if (error) {
    throw new Error(`Failed to load analysis_chunk_runs for job ${jobId}: ${error.message}`);
  }

  return freeze((data ?? []).map((row) => freeze({
    jobId: String((row as { job_id?: string | null }).job_id ?? jobId),
    runKey: String((row as { run_key?: string | null }).run_key ?? ""),
    truthLayerMeta: isRecord((row as { truth_layer_meta?: unknown }).truth_layer_meta)
      ? freeze({ ...((row as { truth_layer_meta?: RecordLike }).truth_layer_meta as RecordLike) })
      : null,
  })));
}

async function loadAnalysisReport(jobId: string): Promise<RecordLike | null> {
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("id, job_id, script_id, version_id, summary_json, findings_count, severity_counts, created_at")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load analysis_reports for job ${jobId}: ${error.message}`);
  }

  return isRecord(data) ? freeze({ ...data }) : null;
}

async function loadAnalysisFindings(jobId: string): Promise<readonly RecordLike[]> {
  const { data, error } = await supabase
    .from("analysis_findings")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load analysis_findings for job ${jobId}: ${error.message}`);
  }

  return freeze((data ?? []).filter(isRecord).map((row) => freeze({ ...row })));
}

async function loadProvenanceReportInput(jobId: string): Promise<ProvenanceReportInput> {
  const [chunkRuns, analysisReport, analysisFindings] = await Promise.all([
    loadChunkRuns(jobId),
    loadAnalysisReport(jobId),
    loadAnalysisFindings(jobId),
  ]);

  return freeze({
    jobId,
    analysisReport,
    analysisFindings,
    chunkRuns,
  });
}

function filterFindingId(report: ReturnType<typeof buildProvenanceReport>, findingId: string | null): ReturnType<typeof buildProvenanceReport> {
  if (!findingId) {
    return report;
  }

  const findings = report.findings.filter((finding) => finding.findingId === findingId || finding.canonicalFindingId === findingId);
  const markdown = renderProvenanceReportMarkdown({
    ...report,
    findings,
    markdown: "",
  });

  return freeze({
    ...report,
    findings,
    markdown,
  });
}

export async function runProvenanceReportCLI(argv = process.argv.slice(2)): Promise<void> {
  const { jobId, output, findingId } = parseArgs(argv);
  if (!jobId) {
    throw new Error("Usage: npm run v4:provenance-report --workspace=worker -- --job-id <JOB_ID> [--finding-id <FINDING_ID>] [--output <FILE>]");
  }

  const input = await loadProvenanceReportInput(jobId);
  const report = filterFindingId(buildProvenanceReport(input), findingId);
  const outputText = report.markdown;

  if (output) {
    await writeFile(output, `${outputText}\n`, "utf8");
  } else {
    process.stdout.write(`${outputText}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProvenanceReportCLI().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
