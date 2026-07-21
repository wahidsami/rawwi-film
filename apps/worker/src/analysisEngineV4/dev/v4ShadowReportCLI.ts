import { supabase } from "../../db.js";

export type ShadowChunkRunRow = Readonly<{
  job_id: string;
  run_key: string;
  truth_layer_meta: Readonly<Record<string, unknown>> | null;
}>;

export type ShadowV4ReportEntry = Readonly<{
  jobId: string;
  runKey: string;
  report: Readonly<Record<string, unknown>> | null;
  runtimeOrchestrator: Readonly<Record<string, unknown>> | null;
  truthLayerMeta: Readonly<Record<string, unknown>> | null;
}>;

export type ShadowV4ReportResult = Readonly<{
  jobId: string;
  reports: readonly ShadowV4ReportEntry[];
}>;

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: readonly string[]): Readonly<{
  jobId: string | null;
  pretty: boolean;
}> {
  let jobId: string | null = null;
  let pretty = true;

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
    if (arg === "--compact") {
      pretty = false;
    }
  }

  return freeze({
    jobId,
    pretty,
  });
}

export function extractShadowV4Reports(rows: readonly ShadowChunkRunRow[]): ShadowV4ReportResult {
  const reports = rows.flatMap((row) => {
    const truthLayerMeta = row.truth_layer_meta;
    if (!truthLayerMeta || !isRecord(truthLayerMeta)) return [];
    const runtimeOrchestrator = isRecord(truthLayerMeta.runtime_orchestrator) ? truthLayerMeta.runtime_orchestrator : null;
    const reportCandidate = runtimeOrchestrator && isRecord(runtimeOrchestrator.report)
      ? runtimeOrchestrator.report
      : isRecord(truthLayerMeta.report)
        ? truthLayerMeta.report
        : null;
    if (!reportCandidate) return [];
    return [freeze({
      jobId: row.job_id,
      runKey: row.run_key,
      report: freeze({ ...reportCandidate }),
      runtimeOrchestrator: runtimeOrchestrator ? freeze({ ...runtimeOrchestrator }) : null,
      truthLayerMeta: freeze({ ...truthLayerMeta }),
    })];
  });

  return freeze({
    jobId: rows[0]?.job_id ?? "",
    reports: freeze(reports),
  });
}

async function loadShadowChunkRuns(jobId: string): Promise<readonly ShadowChunkRunRow[]> {
  let query = supabase
    .from("analysis_chunk_runs")
    .select("job_id, run_key, truth_layer_meta")
    .eq("job_id", jobId)
    .order("run_key", { ascending: true });

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load shadow chunk runs for job ${jobId}: ${error.message}`);
  }

  return (data ?? []) as readonly ShadowChunkRunRow[];
}

export async function runShadowReportCLI(argv = process.argv.slice(2)): Promise<void> {
  const { jobId, pretty } = parseArgs(argv);
  if (!jobId) {
    throw new Error("Usage: npm run v4:shadow-report --workspace=worker -- --job-id <JOB_ID> [--compact]");
  }

  const rows = await loadShadowChunkRuns(jobId);
  const result = extractShadowV4Reports(rows);
  const normalized = freeze({
    ...result,
    jobId: result.jobId || jobId,
  });
  const output = pretty ? JSON.stringify(normalized, null, 2) : JSON.stringify(normalized);
  process.stdout.write(`${output}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runShadowReportCLI().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
