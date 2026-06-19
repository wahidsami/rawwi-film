import assert from "node:assert/strict";
import { containsAnyNormalized, includesNormalizedNeedle, isDetectionVerbatim, normalizeDetectionText } from "./textDetectionNormalize.js";

function testNormalizeDetectionTextHandlesArabicObfuscation() {
  const raw = "قـ ذر";
  const out = normalizeDetectionText(raw);
  assert.equal(out, "قذر");
  console.log("✓ normalizeDetectionText collapses common Arabic obfuscation");
}

function testIncludesNormalizedNeedleMatchesLiteralArabic() {
  const text = "قال له: أنت قذر ولا أحد يطيقك.";
  assert.equal(includesNormalizedNeedle(text, "قذر"), true);
  console.log("✓ includesNormalizedNeedle matches literal Arabic text");
}

function testIsDetectionVerbatimRequiresExactContiguousText() {
  const source = "ضاري يصرخ: انت قذر ثم يدفع الباب.";
  assert.equal(isDetectionVerbatim(source, "انت قذر"), true);
  assert.equal(isDetectionVerbatim("المسؤول عن", "لعن"), false);
  assert.equal(isDetectionVerbatim("المسؤول\nعن", "لعن"), false);
  console.log("✓ isDetectionVerbatim requires exact contiguous text");
}

function testContainsAnyNormalizedMatchesNarrativeHints() {
  const text = "في النهاية عوقب على فعله وظهر ندمه بوضوح.";
  assert.equal(containsAnyNormalized(text, ["عوقب", "ندم"]), true);
  console.log("✓ containsAnyNormalized catches Arabic narrative hints");
}

function testArabicWordBoundaryAvoidsFalsePositives() {
  const text = "اسم الشخصية بلال في هذا المشهد.";
  assert.equal(includesNormalizedNeedle(text, "لا"), false);
  console.log("✓ Arabic detection keeps word boundaries for short hints");
}

function main() {
  testNormalizeDetectionTextHandlesArabicObfuscation();
  testIncludesNormalizedNeedleMatchesLiteralArabic();
  testIsDetectionVerbatimRequiresExactContiguousText();
  testContainsAnyNormalizedMatchesNarrativeHints();
  testArabicWordBoundaryAvoidsFalsePositives();
}

main();
