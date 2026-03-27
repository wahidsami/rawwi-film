import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BENCHMARK_TASKS_URL",
  "BENCHMARK_BEARER_TOKEN",
  "BENCHMARK_VERSION_ID",
];

for (const name of requiredEnv) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const iterations = Math.max(1, Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? "3", 10) || 3);
const pollMs = Math.max(1000, Number.parseInt(process.env.BENCHMARK_POLL_MS ?? "5000", 10) || 5000);
const timeoutMs = Math.max(60_000, Number.parseInt(process.env.BENCHMARK_TIMEOUT_MS ?? "1800000", 10) || 1_800_000);
const versionId = String(process.env.BENCHMARK_VERSION_ID).trim();
const tasksUrl = String(process.env.BENCHMARK_TASKS_URL).trim();
const bearerToken = String(process.env.BENCHMARK_BEARER_TOKEN).trim();
const forceFresh = (process.env.BENCHMARK_FORCE_FRESH ?? "true").toLowerCase() !== "false";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableCompare(a, b) {
  return (
    (a.article_id ?? 0) - (b.article_id ?? 0) ||
    String(a.atom_id ?? "").localeCompare(String(b.atom_id ?? ""), "ar") ||
    (a.start_offset_global ?? Number.MAX_SAFE_INTEGER) - (b.start_offset_global ?? Number.MAX_SAFE_INTEGER) ||
    (a.end_offset_global ?? Number.MAX_SAFE_INTEGER) - (b.end_offset_global ?? Number.MAX_SAFE_INTEGER) ||
    String(a.evidence_snippet ?? "").localeCompare(String(b.evidence_snippet ?? ""), "ar") ||
    String(a.severity ?? "").localeCompare(String(b.severity ?? ""), "ar") ||
    String(a.source ?? "").localeCompare(String(b.source ?? ""), "ar")
  );
}

function canonicalizeFinding(row) {
  return {
    source: row.source ?? "ai",
    article_id: row.article_id ?? 0,
    atom_id: row.atom_id ?? null,
    severity: row.severity ?? null,
    evidence_snippet: row.evidence_snippet ?? "",
    start_offset_global: row.start_offset_global ?? null,
    end_offset_global: row.end_offset_global ?? null,
    title_ar: row.title_ar ?? "",
    rationale_ar: row.rationale_ar ?? "",
  };
}

function buildSignatures(findings) {
  const sorted = findings.map(canonicalizeFinding).sort(stableCompare);
  const decisionOnly = sorted.map((row) => ({
    source: row.source,
    article_id: row.article_id,
    atom_id: row.atom_id,
    severity: row.severity,
    evidence_snippet: row.evidence_snippet,
    start_offset_global: row.start_offset_global,
    end_offset_global: row.end_offset_global,
  }));
  return {
    findings: sorted,
    decisionSignature: sha256(JSON.stringify(decisionOnly)),
    fullSignature: sha256(JSON.stringify(sorted)),
  };
}

async function createBenchmarkJob(iteration) {
  const resp = await fetch(tasksUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      versionId,
      forceFresh,
    }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body?.jobId) {
    throw new Error(`Failed to create job for iteration ${iteration}: ${resp.status} ${JSON.stringify(body)}`);
  }
  return String(body.jobId);
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("id, status, progress_done, progress_total, error_message, created_at, completed_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Job not found: ${jobId}`);

    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(`Job failed: ${jobId} :: ${data.error_message ?? "unknown error"}`);
    }

    process.stdout.write(
      `Waiting for job ${jobId} | status=${data.status} | progress=${data.progress_done ?? 0}/${data.progress_total ?? 0}\r`
    );
    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function loadFindings(jobId) {
  const { data, error } = await supabase
    .from("analysis_findings")
    .select("source, article_id, atom_id, severity, title_ar, rationale_ar, evidence_snippet, start_offset_global, end_offset_global")
    .eq("job_id", jobId);
  if (error) throw error;
  return data ?? [];
}

async function runIteration(iteration) {
  console.log(`\n[benchmark] iteration ${iteration}/${iterations}: creating fresh job`);
  const jobId = await createBenchmarkJob(iteration);
  console.log(`[benchmark] iteration ${iteration}: job ${jobId}`);
  const job = await waitForJob(jobId);
  console.log(`\n[benchmark] iteration ${iteration}: completed at ${job.completed_at ?? "n/a"}`);
  const findings = await loadFindings(jobId);
  const signatures = buildSignatures(findings);
  const counts = findings.reduce(
    (acc, row) => {
      const severity = String(row.severity ?? "").toLowerCase();
      if (severity in acc.severityCounts) acc.severityCounts[severity]++;
      acc.total++;
      return acc;
    },
    { total: 0, severityCounts: { low: 0, medium: 0, high: 0, critical: 0 } }
  );

  return {
    iteration,
    jobId,
    status: job.status,
    findingsCount: counts.total,
    severityCounts: counts.severityCounts,
    decisionSignature: signatures.decisionSignature,
    fullSignature: signatures.fullSignature,
  };
}

function printSummary(results) {
  console.log("\n=== Repeatability Summary ===");
  for (const result of results) {
    console.log(
      [
        `run=${result.iteration}`,
        `job=${result.jobId}`,
        `findings=${result.findingsCount}`,
        `low=${result.severityCounts.low}`,
        `medium=${result.severityCounts.medium}`,
        `high=${result.severityCounts.high}`,
        `critical=${result.severityCounts.critical}`,
        `decisionSig=${result.decisionSignature.slice(0, 12)}`,
        `fullSig=${result.fullSignature.slice(0, 12)}`,
      ].join(" | ")
    );
  }

  const base = results[0];
  const decisionMatches = results.every((r) => r.decisionSignature === base.decisionSignature);
  const fullMatches = results.every((r) => r.fullSignature === base.fullSignature);

  console.log("\n=== Verdict ===");
  console.log(`Decision-level repeatability: ${decisionMatches ? "PASS" : "DRIFT DETECTED"}`);
  console.log(`Full-output repeatability: ${fullMatches ? "PASS" : "DRIFT DETECTED"}`);

  if (!decisionMatches || !fullMatches) {
    console.log("\nInspect runs with different signatures to see whether the drift is in violation decisions or only rationale/title wording.");
  }
}

async function main() {
  console.log(`Running repeatability benchmark for version ${versionId} with ${iterations} iterations`);
  const results = [];
  for (let i = 1; i <= iterations; i++) {
    results.push(await runIteration(i));
  }
  printSummary(results);
}

main().catch((error) => {
  console.error("\n[benchmark] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
