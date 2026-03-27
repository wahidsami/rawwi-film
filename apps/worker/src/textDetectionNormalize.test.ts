import assert from "node:assert/strict";
import { containsAnyNormalized, includesNormalizedNeedle, isDetectionVerbatim, normalizeDetectionText } from "./textDetectionNormalize.js";

function testNormalizeDetectionTextHandlesArabicObfuscation() {
  const raw = "قـ ذر";
  const out = normalizeDetectionText(raw);
  assert.equal(out, "قذر");
  console.log("✓ normalizeDetectionText collapses common Arabic obfuscation");
}

function testIncludesNormalizedNeedleMatchesObfuscatedArabic() {
  const text = "قال له: أنت قـ ذر ولا أحد يطيقك.";
  assert.equal(includesNormalizedNeedle(text, "قذر"), true);
  console.log("✓ includesNormalizedNeedle matches spaced/tatweel Arabic text");
}

function testIsDetectionVerbatimMatchesArabicVariants() {
  const source = "ضاري يصرخ: انت قـ ذر ثم يدفع الباب.";
  assert.equal(isDetectionVerbatim(source, "انت قذر"), true);
  console.log("✓ isDetectionVerbatim accepts equivalent Arabic evidence text");
}

function testContainsAnyNormalizedMatchesNarrativeHints() {
  const text = "في النهاية عُـوقب على فعله وظهر ندمه بوضوح.";
  assert.equal(containsAnyNormalized(text, ["عوقب", "ندم"]), true);
  console.log("✓ containsAnyNormalized catches obfuscated Arabic narrative hints");
}

function testArabicWordBoundaryAvoidsFalsePositives() {
  const text = "اسم الشخصية بلال في هذا المشهد.";
  assert.equal(includesNormalizedNeedle(text, "لا"), false);
  console.log("✓ Arabic detection keeps word boundaries for short hints");
}

function main() {
  testNormalizeDetectionTextHandlesArabicObfuscation();
  testIncludesNormalizedNeedleMatchesObfuscatedArabic();
  testIsDetectionVerbatimMatchesArabicVariants();
  testContainsAnyNormalizedMatchesNarrativeHints();
  testArabicWordBoundaryAvoidsFalsePositives();
}

main();
