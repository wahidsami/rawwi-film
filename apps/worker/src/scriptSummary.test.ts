/**
 * Minimal tests for script summary hashing.
 * Run: npx tsx src/scriptSummary.test.ts
 */
import { computeScriptSummaryHash, type ScriptSummaryPayload } from "./scriptSummary.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testStableHashOrdering() {
  const a: ScriptSummaryPayload = {
    synopsis_ar: "قصة عن عائلة",
    main_characters_ar: "أحمد، سلمى",
    confidence: 0.8,
  };
  const b: ScriptSummaryPayload = {
    confidence: 0.8,
    main_characters_ar: "أحمد، سلمى",
    synopsis_ar: "قصة عن عائلة",
  };
  assert(computeScriptSummaryHash(a) === computeScriptSummaryHash(b), "hash should be stable for key order");
  console.log("✓ script summary hash is stable across object key order");
}

async function main() {
  testStableHashOrdering();
  console.log("\nAll script summary tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
