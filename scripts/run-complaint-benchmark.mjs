import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BENCHMARK_TASKS_URL",
  "BENCHMARK_BEARER_TOKEN",
];

for (const name of requiredEnv) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const datasetPath = process.env.COMPLAINT_BENCHMARK_DATASET || "benchmarks/complaint-pack/dataset.sample.json";
const pollMs = Math.max(1000, Number.parseInt(process.env.COMPLAINT_BENCHMARK_POLL_MS ?? "5000", 10) || 5000);
const timeoutMs = Math.max(60_000, Number.parseInt(process.env.COMPLAINT_BENCHMARK_TIMEOUT_MS ?? "1800000", 10) || 1_800_000);
const forceFresh = (process.env.COMPLAINT_BENCHMARK_FORCE_FRESH ?? "true").toLowerCase() !== "false";
const mergeStrategy = process.env.COMPLAINT_BENCHMARK_MERGE_STRATEGY === "every_occurrence"
  ? "every_occurrence"
  : "same_location_only";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[\u0640\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findingAtomAccepted(finding, expected) {
  const acceptedAtoms = Array.isArray(expected.accepted_atoms) ? expected.accepted_atoms : [];
  if (acceptedAtoms.length === 0) return true;
  return acceptedAtoms.includes(String(finding.atom_id ?? ""));
}

function evidenceAccepted(finding, expected) {
  const probes = Array.isArray(expected.evidence_any) ? expected.evidence_any : [];
  if (probes.length === 0) return true;
  const haystack = normalizeText(
    [finding.evidence_snippet, finding.title_ar, finding.description_ar, finding.rationale_ar]
      .filter(Boolean)
      .join(" ")
  );
  return probes.some((probe) => haystack.includes(normalizeText(probe)));
}

function rationaleAccepted(finding, expected) {
  const probes = Array.isArray(expected.rationale_any) ? expected.rationale_any : [];
  if (probes.length === 0) return true;
  const haystack = normalizeText(finding.rationale_ar ?? "");
  return probes.some((probe) => haystack.includes(normalizeText(probe)));
}

function matchFinding(finding, expected) {
  if ((finding.article_id ?? null) !== (expected.article_id ?? null)) return false;
  if (!findingAtomAccepted(finding, expected)) return false;
  if (!evidenceAccepted(finding, expected)) return false;
  return true;
}

function sortFindingsStable(findings) {
  return [...findings].sort((a, b) =>
    (a.article_id ?? 0) - (b.article_id ?? 0) ||
    String(a.atom_id ?? "").localeCompare(String(b.atom_id ?? ""), "ar") ||
    (a.start_offset_global ?? Number.MAX_SAFE_INTEGER) - (b.start_offset_global ?? Number.MAX_SAFE_INTEGER) ||
    String(a.evidence_snippet ?? "").localeCompare(String(b.evidence_snippet ?? ""), "ar")
  );
}

async function loadDataset() {
  const raw = await readFile(datasetPath, "utf8");
  const parsed = JSON.parse(raw);
  const cases = Array.isArray(parsed.cases) ? parsed.cases : [];
  if (cases.length === 0) {
    throw new Error(`Dataset ${datasetPath} has no cases`);
  }
  return parsed;
}

async function createJob(versionId) {
  const response = await fetch(process.env.BENCHMARK_TASKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BENCHMARK_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      versionId,
      forceFresh,
      analysisOptions: { mergeStrategy },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.jobId) {
    throw new Error(`Failed to create benchmark job for version ${versionId}: ${response.status} ${JSON.stringify(body)}`);
  }
  return String(body.jobId);
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("id, status, progress_done, progress_total, error_message, completed_at")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Job not found: ${jobId}`);
    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(`Job failed: ${jobId} :: ${data.error_message ?? "unknown error"}`);
    }
    process.stdout.write(
      `Waiting for complaint benchmark job ${jobId} | status=${data.status} | progress=${data.progress_done ?? 0}/${data.progress_total ?? 0}\r`
    );
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function loadFindings(jobId) {
  const { data, error } = await supabase
    .from("analysis_findings")
    .select("article_id, atom_id, title_ar, description_ar, rationale_ar, evidence_snippet, start_offset_global, end_offset_global, severity, source")
    .eq("job_id", jobId);
  if (error) throw error;
  return sortFindingsStable(data ?? []);
}

function evaluateCase(caseDef, findings) {
  const missing = [];
  const rationaleMisses = [];
  const unexpected = [];
  const preferredAtomMisses = [];

  for (const expected of caseDef.must_find ?? []) {
    const matches = findings.filter((finding) => matchFinding(finding, expected));
    if (matches.length === 0) {
      missing.push(expected);
      continue;
    }

    const preferredAtom = expected.preferred_atom ? String(expected.preferred_atom) : null;
    if (preferredAtom && !matches.some((finding) => String(finding.atom_id ?? "") === preferredAtom)) {
      preferredAtomMisses.push({
        expected,
        matched_atoms: [...new Set(matches.map((finding) => String(finding.atom_id ?? "")))],
      });
    }

    const rationaleMatched = matches.some((finding) => rationaleAccepted(finding, expected));
    if (!rationaleMatched && Array.isArray(expected.rationale_any) && expected.rationale_any.length > 0) {
      rationaleMisses.push({
        expected,
        sample_rationales: matches.map((finding) => String(finding.rationale_ar ?? "")).filter(Boolean).slice(0, 2),
      });
    }
  }

  for (const forbidden of caseDef.must_not_find ?? []) {
    const matches = findings.filter((finding) => matchFinding(finding, forbidden));
    if (matches.length > 0) {
      unexpected.push({
        forbidden,
        matches: matches.slice(0, 3),
      });
    }
  }

  const casePassed = missing.length === 0 && unexpected.length === 0;
  return {
    casePassed,
    missing,
    rationaleMisses,
    unexpected,
    preferredAtomMisses,
    findingsCount: findings.length,
    signature: sha256(JSON.stringify(findings.map((finding) => ({
      article_id: finding.article_id,
      atom_id: finding.atom_id,
      evidence_snippet: finding.evidence_snippet,
      severity: finding.severity,
    })))),
  };
}

function printCaseResult(caseDef, result, jobId) {
  const label = result.casePassed ? "PASS" : "FAIL";
  console.log(`\n[${label}] ${caseDef.case_id} :: ${caseDef.title}`);
  console.log(`job=${jobId} | findings=${result.findingsCount} | signature=${result.signature.slice(0, 12)}`);

  if (result.missing.length > 0) {
    console.log("  missing expected findings:");
    for (const item of result.missing) {
      console.log(`  - article ${item.article_id} | preferred=${item.preferred_atom ?? "n/a"} | accepted=${(item.accepted_atoms ?? []).join(", ") || "any"}`);
    }
  }

  if (result.unexpected.length > 0) {
    console.log("  unexpected forbidden findings:");
    for (const item of result.unexpected) {
      const sample = item.matches[0];
      console.log(`  - forbidden article ${item.forbidden.article_id} atom ${(item.forbidden.accepted_atoms ?? []).join(", ") || item.forbidden.atom_id || "any"} | sample=${sample?.evidence_snippet ?? "n/a"}`);
    }
  }

  if (result.preferredAtomMisses.length > 0) {
    console.log("  acceptable detection, but preferred atom missed:");
    for (const item of result.preferredAtomMisses) {
      console.log(`  - expected ${item.expected.preferred_atom} | got ${item.matched_atoms.join(", ")}`);
    }
  }

  if (result.rationaleMisses.length > 0) {
    console.log("  weak rationale on matched findings:");
    for (const item of result.rationaleMisses) {
      console.log(`  - article ${item.expected.article_id} | expected rationale cues=${(item.expected.rationale_any ?? []).join(", ")}`);
    }
  }
}

async function main() {
  const dataset = await loadDataset();
  const runnableCases = dataset.cases.filter((item) => String(item.version_id ?? "").trim() !== "");
  const skippedCases = dataset.cases.filter((item) => String(item.version_id ?? "").trim() === "");

  console.log(`Complaint benchmark dataset: ${dataset.dataset_id ?? "unknown"}`);
  console.log(`Dataset path: ${datasetPath}`);
  console.log(`Runnable cases: ${runnableCases.length}`);
  console.log(`Skipped cases without version_id: ${skippedCases.length}`);

  if (skippedCases.length > 0) {
    console.log("Skipped case ids:", skippedCases.map((item) => item.case_id).join(", "));
  }

  if (runnableCases.length === 0) {
    throw new Error("No runnable cases. Fill version_id values in the dataset first.");
  }

  const results = [];
  for (const caseDef of runnableCases) {
    console.log(`\n[benchmark] launching case ${caseDef.case_id} on version ${caseDef.version_id}`);
    const jobId = await createJob(String(caseDef.version_id).trim());
    await waitForJob(jobId);
    console.log("");
    const findings = await loadFindings(jobId);
    const result = evaluateCase(caseDef, findings);
    printCaseResult(caseDef, result, jobId);
    results.push({
      case_id: caseDef.case_id,
      jobId,
      ...result,
    });
  }

  const total = results.length;
  const passed = results.filter((item) => item.casePassed).length;
  const missingCount = results.reduce((sum, item) => sum + item.missing.length, 0);
  const unexpectedCount = results.reduce((sum, item) => sum + item.unexpected.length, 0);
  const preferredAtomMisses = results.reduce((sum, item) => sum + item.preferredAtomMisses.length, 0);
  const rationaleMisses = results.reduce((sum, item) => sum + item.rationaleMisses.length, 0);

  console.log("\n=== Complaint Benchmark Summary ===");
  console.log(`cases_passed=${passed}/${total}`);
  console.log(`missing_expected=${missingCount}`);
  console.log(`unexpected_forbidden=${unexpectedCount}`);
  console.log(`preferred_atom_misses=${preferredAtomMisses}`);
  console.log(`rationale_misses=${rationaleMisses}`);

  const atomBreakdown = new Map();
  for (const item of results) {
    for (const miss of item.preferredAtomMisses) {
      const key = String(miss.expected.preferred_atom ?? "unknown");
      atomBreakdown.set(key, (atomBreakdown.get(key) ?? 0) + 1);
    }
    for (const miss of item.missing) {
      const key = String(miss.preferred_atom ?? miss.article_id ?? "unknown");
      atomBreakdown.set(key, (atomBreakdown.get(key) ?? 0) + 1);
    }
  }
  if (atomBreakdown.size > 0) {
    console.log("weakest_atoms=", [...atomBreakdown.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ar"))
      .map(([key, value]) => `${key}:${value}`)
      .join(" | "));
  }
}

main().catch((error) => {
  console.error("\n[complaint-benchmark] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
