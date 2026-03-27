import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const name of requiredEnv) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const datasetPath = process.env.HUMAN_AI_SCORECARD_DATASET || "benchmarks/human-vs-ai/review-template.csv";
const pollMs = Math.max(1000, Number.parseInt(process.env.HUMAN_AI_SCORECARD_POLL_MS ?? "5000", 10) || 5000);
const timeoutMs = Math.max(60_000, Number.parseInt(process.env.HUMAN_AI_SCORECARD_TIMEOUT_MS ?? "1800000", 10) || 1_800_000);
const forceFresh = (process.env.HUMAN_AI_SCORECARD_FORCE_FRESH ?? "false").toLowerCase() === "true";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current);
  return cells.map((value) => value.trim());
}

async function loadCsvRows(filePath) {
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function parseIntOrNull(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseList(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSortedUniqueNumbers(values) {
  return [...new Set(values
    .map((value) => parseIntOrNull(value))
    .filter((value) => value != null))]
    .sort((a, b) => a - b);
}

function mostCommon(items) {
  const counts = new Map();
  for (const item of items.filter(Boolean)) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ar"));
  return ranked[0]?.[0] ?? null;
}

function normalizeCaseRuling(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "warning") return "needs_review";
  return normalized;
}

function countDuplicates(findings) {
  const seen = new Set();
  let duplicates = 0;
  for (const finding of findings) {
    const signature = [
      finding.primary_article_id ?? "",
      finding.pillar_id ?? "",
      (finding.evidence_snippet ?? "").trim(),
      finding.final_ruling ?? "",
    ].join("|");
    if (seen.has(signature)) {
      duplicates++;
      continue;
    }
    seen.add(signature);
  }
  return duplicates;
}

function deriveAiSummary(summaryJson) {
  const canonicalFindings = Array.isArray(summaryJson?.canonical_findings) ? summaryJson.canonical_findings : [];
  const reportHints = Array.isArray(summaryJson?.report_hints) ? summaryJson.report_hints : [];

  const violationPool = canonicalFindings.filter((item) => (item.final_ruling ?? "violation") === "violation");
  const reviewPool = canonicalFindings.filter((item) => item.final_ruling === "needs_review");
  const contextPool = [
    ...canonicalFindings.filter((item) => item.final_ruling === "context_ok"),
    ...reportHints,
  ];

  const aiRuling =
    violationPool.length > 0 ? "violation"
    : reviewPool.length > 0 ? "needs_review"
    : "context_ok";

  const rulingPool =
    aiRuling === "violation" ? violationPool
    : aiRuling === "needs_review" ? reviewPool
    : contextPool;

  const fallbackPool = rulingPool.length > 0 ? rulingPool : [...canonicalFindings, ...reportHints];
  const aiPrimaryArticle = mostCommon(fallbackPool.map((item) => item.primary_article_id).filter((value) => value != null));
  const aiPillar = mostCommon(fallbackPool.map((item) => item.pillar_id).filter(Boolean));
  const aiRelatedArticles = toSortedUniqueNumbers(
    fallbackPool.flatMap((item) => Array.isArray(item.related_article_ids) ? item.related_article_ids : [])
  );

  return {
    aiRuling,
    aiPrimaryArticle,
    aiPillar,
    aiRelatedArticles,
    finalViolations: violationPool.length,
    specialNotes: reportHints.length,
    duplicateCanonicalCards: countDuplicates([...canonicalFindings, ...reportHints]),
    canonicalFindings,
    reportHints,
  };
}

function setsEqualNumbers(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function createJob(versionId) {
  const tasksUrl = String(process.env.BENCHMARK_TASKS_URL ?? "").trim();
  const bearerToken = String(process.env.BENCHMARK_BEARER_TOKEN ?? "").trim();
  if (!tasksUrl || !bearerToken) {
    throw new Error("BENCHMARK_TASKS_URL and BENCHMARK_BEARER_TOKEN are required when HUMAN_AI_SCORECARD_FORCE_FRESH=true");
  }

  const response = await fetch(tasksUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ versionId, forceFresh: true }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.jobId) {
    throw new Error(`Failed to create scorecard job for version ${versionId}: ${response.status} ${JSON.stringify(body)}`);
  }
  return String(body.jobId);
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("id, status, progress_done, progress_total, error_message")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Job not found: ${jobId}`);
    if (data.status === "completed") return;
    if (data.status === "failed") {
      throw new Error(`Job failed: ${jobId} :: ${data.error_message ?? "unknown error"}`);
    }
    process.stdout.write(
      `Waiting for scorecard job ${jobId} | status=${data.status} | progress=${data.progress_done ?? 0}/${data.progress_total ?? 0}\r`
    );
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for scorecard job ${jobId}`);
}

async function loadReportForRow(row) {
  const reportId = String(row.report_id ?? "").trim();
  const jobId = String(row.job_id ?? "").trim();
  const versionId = String(row.version_id ?? "").trim();

  if (forceFresh) {
    if (!versionId) {
      throw new Error(`Row ${row.case_id || "unknown"} is missing version_id for fresh scorecard run`);
    }
    const freshJobId = await createJob(versionId);
    await waitForJob(freshJobId);
    const { data, error } = await supabase
      .from("analysis_reports")
      .select("id, job_id, version_id, summary_json, created_at")
      .eq("job_id", freshJobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`No report found for fresh job ${freshJobId}`);
    return data;
  }

  if (reportId) {
    const { data, error } = await supabase
      .from("analysis_reports")
      .select("id, job_id, version_id, summary_json, created_at")
      .eq("id", reportId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Report not found: ${reportId}`);
    return data;
  }

  if (jobId) {
    const { data, error } = await supabase
      .from("analysis_reports")
      .select("id, job_id, version_id, summary_json, created_at")
      .eq("job_id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Report not found for job ${jobId}`);
    return data;
  }

  if (versionId) {
    const { data, error } = await supabase
      .from("analysis_reports")
      .select("id, job_id, version_id, summary_json, created_at")
      .eq("version_id", versionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const report = data?.[0];
    if (!report) throw new Error(`No report found for version ${versionId}`);
    return report;
  }

  throw new Error(`Row ${row.case_id || "unknown"} must provide one of report_id, job_id, or version_id`);
}

function evaluateRow(row, ai) {
  const expectedRuling = normalizeCaseRuling(row.expected_ruling);
  const expectedPrimaryArticle = parseIntOrNull(row.expected_primary_article);
  const expectedRelatedArticles = toSortedUniqueNumbers(parseList(row.expected_related_articles));
  const expectedPillar = String(row.expected_pillar ?? "").trim();
  const expectedFinalViolationsMin = parseIntOrNull(row.expected_final_violations_min);
  const expectedFinalViolationsMax = parseIntOrNull(row.expected_final_violations_max);
  const expectedSpecialNotesMin = parseIntOrNull(row.expected_special_notes_min);
  const expectedSpecialNotesMax = parseIntOrNull(row.expected_special_notes_max);
  const expectedDuplicates = parseIntOrNull(row.duplicate_canonical_cards_expected);

  const rulingMatch = !expectedRuling || ai.aiRuling === expectedRuling;
  const primaryMatch = expectedPrimaryArticle == null || ai.aiPrimaryArticle === expectedPrimaryArticle;
  const pillarMatch = !expectedPillar || ai.aiPillar === expectedPillar;
  const relatedMatch = expectedRelatedArticles.length === 0 || setsEqualNumbers(ai.aiRelatedArticles, expectedRelatedArticles);

  const violationsInRange =
    (expectedFinalViolationsMin == null || ai.finalViolations >= expectedFinalViolationsMin) &&
    (expectedFinalViolationsMax == null || ai.finalViolations <= expectedFinalViolationsMax);
  const notesInRange =
    (expectedSpecialNotesMin == null || ai.specialNotes >= expectedSpecialNotesMin) &&
    (expectedSpecialNotesMax == null || ai.specialNotes <= expectedSpecialNotesMax);
  const duplicateMatch = expectedDuplicates == null || ai.duplicateCanonicalCards === expectedDuplicates;

  const passed = rulingMatch && primaryMatch && pillarMatch && relatedMatch && violationsInRange && notesInRange && duplicateMatch;

  return {
    caseId: row.case_id,
    title: row.title || row.case_id,
    expectedRuling,
    aiRuling: ai.aiRuling,
    expectedPrimaryArticle,
    aiPrimaryArticle: ai.aiPrimaryArticle,
    expectedRelatedArticles,
    aiRelatedArticles: ai.aiRelatedArticles,
    expectedPillar,
    aiPillar: ai.aiPillar,
    finalViolations: ai.finalViolations,
    specialNotes: ai.specialNotes,
    duplicateCanonicalCards: ai.duplicateCanonicalCards,
    rulingMatch,
    primaryMatch,
    pillarMatch,
    relatedMatch,
    violationsInRange,
    notesInRange,
    duplicateMatch,
    passed,
  };
}

function buildMetrics(results) {
  const total = results.length;
  const humanViolationCases = results.filter((item) => item.expectedRuling === "violation").length;
  const aiViolationCases = results.filter((item) => item.aiRuling === "violation").length;
  const truePositiveViolations = results.filter((item) => item.expectedRuling === "violation" && item.aiRuling === "violation").length;

  const strictAgreement = total > 0 ? results.filter((item) => item.rulingMatch).length / total : 0;
  const primaryAccuracy = total > 0 ? results.filter((item) => item.primaryMatch).length / total : 0;
  const pillarAccuracy = total > 0 ? results.filter((item) => item.pillarMatch).length / total : 0;
  const relatedAccuracy = total > 0 ? results.filter((item) => item.relatedMatch).length / total : 0;
  const fullCasePassRate = total > 0 ? results.filter((item) => item.passed).length / total : 0;
  const duplicateFreeRate = total > 0 ? results.filter((item) => item.duplicateCanonicalCards === 0).length / total : 0;
  const violationPrecision = aiViolationCases > 0 ? truePositiveViolations / aiViolationCases : 0;
  const violationRecall = humanViolationCases > 0 ? truePositiveViolations / humanViolationCases : 0;
  const violationF1 = (violationPrecision + violationRecall) > 0
    ? (2 * violationPrecision * violationRecall) / (violationPrecision + violationRecall)
    : 0;

  return {
    totalCases: total,
    strictAgreement,
    primaryAccuracy,
    pillarAccuracy,
    relatedAccuracy,
    fullCasePassRate,
    duplicateFreeRate,
    violationPrecision,
    violationRecall,
    violationF1,
  };
}

function printCaseResult(result, report) {
  const label = result.passed ? "PASS" : "FAIL";
  console.log(`\n[${label}] ${result.caseId} :: ${result.title}`);
  console.log(`report=${report.id} | job=${report.job_id} | ai=${result.aiRuling} | expected=${result.expectedRuling || "n/a"}`);

  if (!result.rulingMatch) {
    console.log(`  ruling mismatch: expected=${result.expectedRuling} | actual=${result.aiRuling}`);
  }
  if (!result.primaryMatch) {
    console.log(`  primary article mismatch: expected=${result.expectedPrimaryArticle ?? "n/a"} | actual=${result.aiPrimaryArticle ?? "n/a"}`);
  }
  if (!result.pillarMatch) {
    console.log(`  pillar mismatch: expected=${result.expectedPillar || "n/a"} | actual=${result.aiPillar || "n/a"}`);
  }
  if (!result.relatedMatch) {
    console.log(`  related articles mismatch: expected=${result.expectedRelatedArticles.join("|") || "n/a"} | actual=${result.aiRelatedArticles.join("|") || "n/a"}`);
  }
  if (!result.violationsInRange) {
    console.log(`  final violations out of range: actual=${result.finalViolations}`);
  }
  if (!result.notesInRange) {
    console.log(`  special notes out of range: actual=${result.specialNotes}`);
  }
  if (!result.duplicateMatch) {
    console.log(`  duplicate canonical cards mismatch: actual=${result.duplicateCanonicalCards}`);
  }
}

function printSummary(metrics) {
  console.log("\n=== Human vs AI Scorecard ===");
  console.log(`Cases scored: ${metrics.totalCases}`);
  console.log(`Strict ruling agreement: ${(metrics.strictAgreement * 100).toFixed(1)}%`);
  console.log(`Primary article accuracy: ${(metrics.primaryAccuracy * 100).toFixed(1)}%`);
  console.log(`Pillar accuracy: ${(metrics.pillarAccuracy * 100).toFixed(1)}%`);
  console.log(`Related article accuracy: ${(metrics.relatedAccuracy * 100).toFixed(1)}%`);
  console.log(`Full case pass rate: ${(metrics.fullCasePassRate * 100).toFixed(1)}%`);
  console.log(`Duplicate-free rate: ${(metrics.duplicateFreeRate * 100).toFixed(1)}%`);
  console.log(`Violation precision: ${(metrics.violationPrecision * 100).toFixed(1)}%`);
  console.log(`Violation recall: ${(metrics.violationRecall * 100).toFixed(1)}%`);
  console.log(`Violation F1: ${(metrics.violationF1 * 100).toFixed(1)}%`);
}

async function main() {
  const rows = await loadCsvRows(datasetPath);
  const runnableRows = rows.filter((row) => String(row.case_id ?? "").trim() !== "");
  if (runnableRows.length === 0) {
    throw new Error(`Dataset ${datasetPath} has no runnable rows`);
  }

  console.log(`Human vs AI dataset: ${datasetPath}`);
  console.log(`Rows: ${runnableRows.length}`);
  console.log(`Mode: ${forceFresh ? "fresh-run" : "existing-report"}`);

  const results = [];
  for (const row of runnableRows) {
    const report = await loadReportForRow(row);
    const ai = deriveAiSummary(report.summary_json ?? {});
    const result = evaluateRow(row, ai);
    results.push(result);
    printCaseResult(result, report);
  }

  const metrics = buildMetrics(results);
  printSummary(metrics);
}

main().catch((error) => {
  console.error("\n[human-ai-scorecard] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
