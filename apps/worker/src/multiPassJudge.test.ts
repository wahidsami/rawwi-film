/**
 * Regression tests for the V3 multi-pass judge compact-output path.
 * Run: node --import tsx apps/worker/src/multiPassJudge.test.ts
 */
import { strict as assert } from "node:assert";

import { canonicalStringify } from "./canonicalJson.js";
import type { GCAMArticle } from "./gcam.js";
import type { JudgeRawFinding } from "./schemas.js";

function buildArticle(id: number, title_ar: string): GCAMArticle {
  return {
    id,
    title_ar,
    text_ar: "",
    atoms: [],
  } as GCAMArticle;
}

async function testIdenticalRawJudgeResponsesProduceIdenticalEnrichedFindings(): Promise<void> {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dummy-service-role-key";
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "dummy-openai-key";

  const { enrichRawJudgeFinding, buildJudgeEnrichmentProof } = await import("./multiPassJudge.js");

  const chunkText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const startOffset = chunkText.indexOf("يا كلب");
  const rawFinding: JudgeRawFinding = {
    startOffset,
    endOffset: startOffset + "يا كلب".length,
    reason: "إهانة مباشرة في الحوار",
    confidence: 0.91,
  };
  const context = {
    finding: rawFinding,
    chunkText,
    passName: "insults",
    articles: [buildArticle(5, "الإهانة والسب")],
    lexiconTerms: [],
  };

  const first = enrichRawJudgeFinding(context);
  const second = enrichRawJudgeFinding(context);
  const proofA = buildJudgeEnrichmentProof({
    promptHash: "proof-prompt",
    renderedSystemPrompt: "system prompt",
    renderedUserPrompt: "user prompt",
    rawJudgeResponse: JSON.stringify({ findings: [rawFinding] }),
    rawFindings: [rawFinding],
    enrichedFindings: [first],
    parseDurationMs: 7,
    enrichmentDurationMs: 3,
  });
  const proofB = buildJudgeEnrichmentProof({
    promptHash: "proof-prompt",
    renderedSystemPrompt: "system prompt",
    renderedUserPrompt: "user prompt",
    rawJudgeResponse: JSON.stringify({ findings: [rawFinding] }),
    rawFindings: [rawFinding],
    enrichedFindings: [second],
    parseDurationMs: 7,
    enrichmentDurationMs: 3,
  });

  assert.deepEqual(first, second);
  assert.equal(canonicalStringify(first), canonicalStringify(second));
  assert.equal(first.evidence_snippet, "يا كلب");
  assert.equal(first.rationale_ar, "إهانة مباشرة في الحوار");
  assert.equal(first.canonical_atom, "INSULT");
  assert.deepEqual(proofA, proofB);
  assert.equal(proofA.rawResponseLength, JSON.stringify({ findings: [rawFinding] }).length);
  assert.equal(proofA.enrichedFindingCount, 1);
  assert.equal(proofA.determinismDelta, 0);
}

async function main(): Promise<void> {
  await testIdenticalRawJudgeResponsesProduceIdenticalEnrichedFindings();
  console.log("\nAll multiPassJudge compact-output tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
