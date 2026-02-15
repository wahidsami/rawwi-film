/**
 * Test AI atom enforcement: invalid atom_id is cleared, valid/normalized preserved.
 * Run: SUPABASE_URL=http://localhost SUPABASE_SERVICE_ROLE_KEY=x npx tsx src/pipeline.atom-enforcement.test.ts
 */
import { enforceAtomIds } from "./pipeline.js";
import type { JudgeFinding } from "./schemas.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const loc = { start_offset: 0, end_offset: 10, start_line: 1, end_line: 1 };

function testInvalidAtomCleared() {
  const findings: JudgeFinding[] = [
    {
      article_id: 5,
      atom_id: "99-1",
      title_ar: "x",
      description_ar: "",
      severity: "low",
      confidence: 0.8,
      evidence_snippet: "y",
      location: loc,
    },
  ];
  const out = enforceAtomIds(findings);
  assert(out.length === 1, "one finding");
  assert(out[0].atom_id === null, "invalid atom_id 99-1 for article 5 should be cleared to null");
  console.log("✓ Invalid atom_id cleared to null");
}

function testValidAtomPreserved() {
  const findings: JudgeFinding[] = [
    {
      article_id: 5,
      atom_id: "5-2",
      title_ar: "x",
      description_ar: "",
      severity: "low",
      confidence: 0.8,
      evidence_snippet: "y",
      location: loc,
    },
  ];
  const out = enforceAtomIds(findings);
  assert(out.length === 1, "one finding");
  assert(out[0].atom_id === "5-2", "valid atom_id 5-2 should be preserved");
  console.log("✓ Valid atom_id preserved");
}

function testNormalizedAtomAccepted() {
  const findings: JudgeFinding[] = [
    {
      article_id: 5,
      atom_id: "5.2",
      title_ar: "x",
      description_ar: "",
      severity: "low",
      confidence: 0.8,
      evidence_snippet: "y",
      location: loc,
    },
  ];
  const out = enforceAtomIds(findings);
  assert(out.length === 1, "one finding");
  assert(out[0].atom_id === "5-2", "legacy 5.2 should be normalized to 5-2");
  console.log("✓ Legacy atom_id normalized to N-N");
}

function testArticleWithNoAtomsAcceptsNull() {
  const findings: JudgeFinding[] = [
    {
      article_id: 1,
      atom_id: null,
      title_ar: "x",
      description_ar: "",
      severity: "low",
      confidence: 0.8,
      evidence_snippet: "y",
      location: loc,
    },
  ];
  const out = enforceAtomIds(findings);
  assert(out.length === 1 && out[0].atom_id === null, "article 1 has no atoms; null preserved");
  console.log("✓ Article with no atoms accepts null");
}

async function main() {
  testInvalidAtomCleared();
  testValidAtomPreserved();
  testNormalizedAtomAccepted();
  testArticleWithNoAtomsAcceptsNull();
  console.log("\nAll atom enforcement tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
