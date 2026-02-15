/**
 * Tests for report aggregation: taxonomy order, dedup, article 26 excluded.
 * Run: npx tsx src/aggregation.test.ts (from apps/worker or repo root)
 */
import { buildSummaryJson } from "./aggregation.js";
import { getPolicyArticles } from "./policyMap.js";

type DbFinding = {
  source?: string;
  article_id: number;
  atom_id: string | null;
  severity: string;
  confidence: number | null;
  title_ar: string;
  description_ar: string;
  evidence_snippet: string;
  start_offset_global: number | null;
  end_offset_global: number | null;
  start_line_chunk: number | null;
  end_line_chunk: number | null;
  location: unknown;
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Policy order: article ids in PolicyMap order (1..24 for scannable, no 26)
function testArticleOrder() {
  const policyArticles = getPolicyArticles().filter((a) => a.articleId !== 26);
  const expectedIds = policyArticles.map((a) => a.articleId);
  const findings: DbFinding[] = [
    { article_id: 8, atom_id: "8-1", severity: "low", confidence: 0.9, title_ar: "x", description_ar: "", evidence_snippet: "a", start_offset_global: 0, end_offset_global: 1, start_line_chunk: null, end_line_chunk: null, location: {} },
    { article_id: 5, atom_id: "5-1", severity: "medium", confidence: 0.8, title_ar: "y", description_ar: "", evidence_snippet: "b", start_offset_global: 10, end_offset_global: 11, start_line_chunk: null, end_line_chunk: null, location: {} },
    { article_id: 5, atom_id: "5-2", severity: "low", confidence: 0.7, title_ar: "z", description_ar: "", evidence_snippet: "c", start_offset_global: 20, end_offset_global: 21, start_line_chunk: null, end_line_chunk: null, location: {} },
  ];
  const summary = buildSummaryJson("job1", "script1", findings);
  const gotIds = summary.findings_by_article.map((a) => a.article_id);
  const sortedExpected = [...gotIds].sort((a, b) => a - b);
  assert(
    JSON.stringify(gotIds) === JSON.stringify(sortedExpected),
    `findings_by_article should be sorted by article_id asc; got ${JSON.stringify(gotIds)}`
  );
  assert(
    summary.findings_by_article[0].article_id === 5 && summary.findings_by_article[1].article_id === 8,
    "Order should be 5 then 8 (policy/article id asc)"
  );
  console.log("✓ Article/atom order follows policyMap (articleId asc)");
}

// Dedup: same source+article+atom+span+snippet → one finding, highest severity kept
function testDedup() {
  const snippet = "same evidence text";
  const findings: DbFinding[] = [
    { source: "ai", article_id: 5, atom_id: "5-1", severity: "low", confidence: 0.5, title_ar: "a", description_ar: "", evidence_snippet: snippet, start_offset_global: 0, end_offset_global: 10, start_line_chunk: null, end_line_chunk: null, location: {} },
    { source: "ai", article_id: 5, atom_id: "5-1", severity: "high", confidence: 0.9, title_ar: "b", description_ar: "", evidence_snippet: snippet, start_offset_global: 0, end_offset_global: 10, start_line_chunk: null, end_line_chunk: null, location: {} },
  ];
  const summary = buildSummaryJson("job1", "script1", findings);
  assert(summary.totals.findings_count === 1, `Dedup: expected 1 finding, got ${summary.totals.findings_count}`);
  assert(summary.totals.severity_counts.high === 1, "Dedup: should keep highest severity (high)");
  console.log("✓ Dedup: duplicates removed, highest severity kept");
}

// Article 26 excluded from report
function testArticle26Excluded() {
  const findings: DbFinding[] = [
    { article_id: 26, atom_id: null, severity: "critical", confidence: 1, title_ar: "out", description_ar: "", evidence_snippet: "x", start_offset_global: 0, end_offset_global: 1, start_line_chunk: null, end_line_chunk: null, location: {} },
  ];
  const summary = buildSummaryJson("job1", "script1", findings);
  assert(summary.totals.findings_count === 0, "Article 26 should be excluded from report");
  assert(summary.findings_by_article.length === 0, "No findings_by_article for 26");
  console.log("✓ Article 26 (out-of-scope) excluded from report");
}

// Source badge labels (conceptual: we only test that summary builds; badge is UI)
function testSummaryHasFindingsByArticle() {
  const findings: DbFinding[] = [
    { source: "manual", article_id: 5, atom_id: "5-1", severity: "medium", confidence: 1, title_ar: "ملاحظة يدوية", description_ar: "", evidence_snippet: "m", start_offset_global: 0, end_offset_global: 1, start_line_chunk: null, end_line_chunk: null, location: {} },
    { source: "ai", article_id: 5, atom_id: "5-2", severity: "low", confidence: 0.8, title_ar: "AI", description_ar: "", evidence_snippet: "ai", start_offset_global: 2, end_offset_global: 3, start_line_chunk: null, end_line_chunk: null, location: {} },
    { source: "lexicon_mandatory", article_id: 8, atom_id: "8-1", severity: "high", confidence: 1, title_ar: "قاموس", description_ar: "", evidence_snippet: "lex", start_offset_global: 5, end_offset_global: 6, start_line_chunk: null, end_line_chunk: null, location: {} },
  ];
  const summary = buildSummaryJson("job1", "script1", findings);
  assert(summary.totals.findings_count === 3, "All three sources should appear");
  assert(summary.findings_by_article.some((a) => a.article_id === 5) && summary.findings_by_article.some((a) => a.article_id === 8), "Articles 5 and 8 present");
  console.log("✓ Summary includes findings from AI, manual, glossary (sources for badge)");
}

async function main() {
  testArticleOrder();
  testDedup();
  testArticle26Excluded();
  testSummaryHasFindingsByArticle();
  console.log("\nAll aggregation tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
