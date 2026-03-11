#!/usr/bin/env node
/**
 * Calibration gate checker for Humanoid Auditor Big Jump.
 * Reads results-template.csv (actuals) and matrix.csv (expected), outputs pass/fail vs KPI gate.
 *
 * Usage: node docs/golden-saudi-scripts/check-gate.mjs
 * Prereq: Fill results-template.csv with actual run data (actual_ruling, actual_primary_article, duplicate_canonical_cards).
 *
 * Gate (2 consecutive runs):
 * - Duplicate canonical cards per report: 0
 * - Primary article accuracy: >= 90%
 * - Ruling accuracy: >= 85%
 * - Rationale acceptance: >= 80% (manual; script reminds)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

function main() {
  const resultsPath = path.join(__dirname, "results-template.csv");
  const matrixPath = path.join(__dirname, "matrix.csv");
  if (!fs.existsSync(resultsPath) || !fs.existsSync(matrixPath)) {
    console.error("Missing results-template.csv or matrix.csv in docs/golden-saudi-scripts/");
    process.exit(1);
  }

  const results = parseCsv(resultsPath);
  const matrix = parseCsv(matrixPath);
  const byCase = new Map(matrix.map((r) => [r.case_id, r]));

  let rulingMatch = 0;
  let primaryMatch = 0;
  let totalDuplicates = 0;
  let filled = 0;

  for (const row of results) {
    const caseId = row.case_id;
    if (!caseId) continue;
    const exp = byCase.get(caseId);
    if (!exp) continue;

    const actualRuling = (row.actual_ruling || "").toLowerCase().trim();
    const expectedRuling = (exp.expected_ruling || "").toLowerCase().trim();
    const actualPrimary = row.actual_primary_article ? String(row.actual_primary_article).trim() : "";
    const expectedPrimary = exp.expected_primary_article ? String(exp.expected_primary_article).trim() : "";

    if (actualRuling || actualPrimary) filled++;
    if (actualRuling && expectedRuling && actualRuling === expectedRuling) rulingMatch++;
    if (actualPrimary && expectedPrimary && actualPrimary === expectedPrimary) primaryMatch++;
    const dup = parseInt(row.duplicate_canonical_cards, 10);
    if (!Number.isNaN(dup)) totalDuplicates += dup;
  }

  const n = results.filter((r) => byCase.has(r.case_id)).length;
  const rulingAccuracy = n > 0 ? rulingMatch / n : 0;
  const primaryAccuracy = n > 0 ? primaryMatch / n : 0;

  const gateDuplicate = totalDuplicates === 0;
  const gatePrimary = primaryAccuracy >= 0.9;
  const gateRuling = rulingAccuracy >= 0.85;

  console.log("--- Calibration gate check ---");
  console.log(`Cases: ${filled}/${n} filled`);
  console.log(`Duplicate canonical cards (total): ${totalDuplicates} (gate: 0) ${gateDuplicate ? "PASS" : "FAIL"}`);
  console.log(`Primary article accuracy: ${(primaryAccuracy * 100).toFixed(1)}% (gate: >=90%) ${gatePrimary ? "PASS" : "FAIL"}`);
  console.log(`Ruling accuracy: ${(rulingAccuracy * 100).toFixed(1)}% (gate: >=85%) ${gateRuling ? "PASS" : "FAIL"}`);
  console.log("Rationale acceptance: manual (gate: >=80%); fill auditor_notes and reviewer sign-off.");
  const allPass = gateDuplicate && gatePrimary && gateRuling;
  console.log(allPass ? "\nGate: PASS (automated). Confirm rationale acceptance before switching to enforce." : "\nGate: FAIL. Tune and re-run.");
  process.exit(allPass ? 0 : 1);
}

main();
