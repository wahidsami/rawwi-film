import { strict as assert } from "node:assert";

import { splitSentenceEvidenceCandidates } from "./evidenceCandidates.js";

function testTerminalSentenceDoesNotLoop(): void {
  const startedAt = Date.now();
  const candidates = splitSentenceEvidenceCandidates("A: test");

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.text, "A: test");
  assert.ok(Date.now() - startedAt < 1000, "sentence splitting should complete quickly");
  console.log("✓ terminal sentence evidence splitting completes and returns one candidate");
}

function main(): void {
  testTerminalSentenceDoesNotLoop();
  console.log("\nAll evidence candidate tests passed.");
}

main();
