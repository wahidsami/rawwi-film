/**
 * Regression tests for V3-aware persistence filtering.
 * Run: node --import tsx apps/worker/src/persistenceFilters.v3.test.ts
 */
import { strict as assert } from "node:assert";
import type { FindingWithGlobal } from "./pipeline.js";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { applyPersistenceFilters } = await import("./pipeline.js");

function buildFinding(overrides: Partial<FindingWithGlobal>): FindingWithGlobal {
  return {
    source: "ai",
    article_id: 5,
    atom_id: "5-1",
    severity: "medium",
    confidence: 0.9,
    title_ar: "عنوان",
    description_ar: "وصف",
    evidence_snippet: "يا خرا",
    start_offset_global: 0,
    end_offset_global: 6,
    start_line_chunk: 1,
    end_line_chunk: 1,
    location: {
      start_offset: 0,
      end_offset: 6,
      start_line: 1,
      end_line: 1,
    },
    canonical_atom: "5-1",
    intensity: null,
    context_impact: null,
    legal_sensitivity: null,
    audience_risk: null,
    lineage_id: null,
    parent_lineage_id: null,
    canonical_hash: null,
    evidence_hash: null,
    rationale_ar: "سبب",
    final_ruling: "violation",
    detection_pass: "v2_legacy",
    is_interpretive: false,
    depiction_type: "unknown",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: null,
    lexical_confidence: null,
    policy_confidence: null,
    policy_links: [],
    primary_article_id: 5,
    related_article_ids: [5],
    ...overrides,
  } as FindingWithGlobal;
}

function testV3ArticleFourSurvivesLegacyCollision() {
  const normalizedText = "يا خرا";
  const result = applyPersistenceFilters({
    normalizedText,
    findings: [
      buildFinding({
        source: "v3",
        article_id: 4,
        atom_id: "4-1",
        canonical_atom: "4-1",
        detection_pass: "v3_runtime_religion",
      }),
      buildFinding({
        source: "ai",
        article_id: 5,
        atom_id: "5-1",
        canonical_atom: "5-1",
        detection_pass: "v2_legacy",
      }),
    ],
  });

  assert.equal(result.accepted.length, 2, "V3 article-4 finding should survive alongside a specific finding");
  assert.equal(result.rejected.length, 0, "V3 findings should not be rejected by legacy article-4 redundancy");
  assert(result.accepted.some((finding) => finding.article_id === 4 && finding.source === "v3"), "V3 article-4 finding should remain accepted");
  assert(result.accepted.some((finding) => finding.article_id === 5), "specific article finding should remain accepted");
  console.log("✓ V3 article-4 finding survives persistence alongside a specific finding");
}

function testLegacyArticleFourStillCollapses() {
  const normalizedText = "يا خرا";
  const result = applyPersistenceFilters({
    normalizedText,
    findings: [
      buildFinding({
        source: "ai",
        article_id: 4,
        atom_id: "4-1",
        canonical_atom: "4-1",
        detection_pass: "v2_legacy",
      }),
      buildFinding({
        source: "ai",
        article_id: 5,
        atom_id: "5-1",
        canonical_atom: "5-1",
        detection_pass: "v2_legacy",
      }),
    ],
  });

  assert.equal(result.accepted.length, 1, "legacy article-4 finding should be collapsed");
  assert.equal(result.accepted[0].article_id, 5, "specific article finding should remain");
  assert.equal(result.rejected.length, 1, "legacy article-4 finding should be rejected");
  assert.equal(result.rejected[0].filterName, "dropRedundantArticleFourFindings", "legacy article-4 collapse should come from the redundancy filter");
  console.log("✓ Legacy article-4 redundancy still behaves as before");
}

async function main() {
  testV3ArticleFourSurvivesLegacyCollision();
  testLegacyArticleFourStillCollapses();
  console.log("\nAll persistence filter regression tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
