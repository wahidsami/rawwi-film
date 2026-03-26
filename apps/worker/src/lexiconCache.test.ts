/**
 * Tests for conservative Arabic lexicon normalization and obfuscated matching.
 * Run: npx tsx src/lexiconCache.test.ts
 */
import { canonicalArabicToken, findStringMatches } from "./lexiconCache.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testCanonicalArabicToken() {
  const raw = "قـُذَر\u200F";
  const out = canonicalArabicToken(raw);
  assert(out === "قذر", `expected canonical token to be "قذر", got "${out}"`);
  console.log("✓ canonicalArabicToken removes common Arabic obfuscation");
}

function testObfuscatedWordMatch() {
  const text = "هذا وصف قـ ذر وغير مقبول.";
  const matches = findStringMatches(text, "قذر", "word");
  assert(matches.length === 1, `expected 1 obfuscated match, got ${matches.length}`);
  assert(matches[0]?.matchedText === "قـ ذر", `expected matched text to preserve raw evidence, got "${matches[0]?.matchedText}"`);
  console.log("✓ word match catches spaced/tatweel Arabic profanity");
}

function testDiacriticsAndAlefVariants() {
  const text = "هذا النص فيه أَلْفاظ قذرة.";
  const matches = findStringMatches(text, "الفاظ", "word");
  assert(matches.length === 1, `expected 1 alef/diacritic match, got ${matches.length}`);
  console.log("✓ word match catches common alef/diacritic normalization");
}

function testNoFalsePositiveAcrossDifferentLetters() {
  const text = "هذه قصة عن رجل ذكي وراقي.";
  const matches = findStringMatches(text, "قذر", "word");
  assert(matches.length === 0, `expected 0 unrelated matches, got ${matches.length}`);
  console.log("✓ no false positive on unrelated Arabic text");
}

async function main() {
  testCanonicalArabicToken();
  testObfuscatedWordMatch();
  testDiacriticsAndAlefVariants();
  testNoFalsePositiveAcrossDifferentLetters();
  console.log("\nAll lexicon normalization tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
