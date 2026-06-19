import assert from "node:assert/strict";
import { findExactContiguousMatches, isExactContiguousSpan } from "./exactContiguousMatch.js";

function testRejectsCrossWordEvidence() {
  const text = "المسؤول عن توزيع أمريكا";
  const matches = findExactContiguousMatches(text, "لعن", "word");
  assert.equal(matches.length, 0);
  assert.equal(isExactContiguousSpan(text, "لعن"), false);
  console.log("✓ rejects cross-word Arabic evidence");
}

function testAcceptsLiteralWordEvidence() {
  const text = "يلعن حظه";
  const matches = findExactContiguousMatches(text, "يلعن", "word");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.matchedText, "يلعن");
  assert.equal(isExactContiguousSpan(text, "يلعن"), true);
  console.log("✓ accepts contiguous Arabic evidence with prefix");
}

function testAcceptsLiteralWordEvidenceBare() {
  const text = "لعن حظه";
  const matches = findExactContiguousMatches(text, "لعن", "word");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.matchedText, "لعن");
  assert.equal(isExactContiguousSpan(text, "لعن"), true);
  console.log("✓ accepts contiguous bare Arabic evidence");
}

function testRejectsNewlineBoundaryEvidence() {
  const text = "المسؤول\nعن";
  const matches = findExactContiguousMatches(text, "لعن", "word");
  assert.equal(matches.length, 0);
  assert.equal(isExactContiguousSpan(text, "لعن"), false);
  console.log("✓ rejects newline-crossing Arabic evidence");
}

function main() {
  testRejectsCrossWordEvidence();
  testAcceptsLiteralWordEvidence();
  testAcceptsLiteralWordEvidenceBare();
  testRejectsNewlineBoundaryEvidence();
  console.log("\nAll exact contiguous evidence tests passed.");
}

main();
