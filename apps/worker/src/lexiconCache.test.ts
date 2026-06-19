/**
 * Tests for exact Arabic lexicon matching.
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

function testExactArabicWordMatch() {
  const text = "هذا وصف قذر وغير مقبول.";
  const matches = findStringMatches(text, "قذر", "word");
  assert(matches.length === 1, `expected 1 exact match, got ${matches.length}`);
  assert(matches[0]?.matchedText === "قذر", `expected matched text to preserve raw evidence, got "${matches[0]?.matchedText}"`);
  console.log("✓ word match keeps exact Arabic evidence contiguous");
}

function testDiacriticsAndAlefVariants() {
  const text = "هذا النص فيه ألفاظ قذرة.";
  const matches = findStringMatches(text, "ألفاظ", "word");
  assert(matches.length === 1, `expected 1 exact Arabic match, got ${matches.length}`);
  console.log("✓ word match keeps literal Arabic text");
}

function testNoCrossWordMatch() {
  const text = "المسؤول عن توزيع أمريكا";
  const matches = findStringMatches(text, "لعن", "word");
  assert(matches.length === 0, `expected 0 cross-word matches, got ${matches.length}`);
  console.log("✓ word match rejects cross-word evidence");
}

function testNoPartialSubstringMatchInsideArabicWord() {
  const falsePositives = ["الجبنة", "البنت", "مبنى", "تبني"];
  for (const sample of falsePositives) {
    const matches = findStringMatches(sample, "بن", "word");
    assert(matches.length === 0, `expected 0 partial matches inside "${sample}", got ${matches.length}`);
  }
  const positive = findStringMatches("بن", "بن", "word");
  assert(positive.length === 1, `expected 1 standalone token match, got ${positive.length}`);
  console.log("✓ word match rejects partial Arabic substrings and keeps standalone tokens");
}

function testNoFalsePositiveAcrossDifferentLetters() {
  const text = "هذه قصة عن رجل ذكي وراقي.";
  const matches = findStringMatches(text, "قذر", "word");
  assert(matches.length === 0, `expected 0 unrelated matches, got ${matches.length}`);
  console.log("✓ no false positive on unrelated Arabic text");
}

async function main() {
  testCanonicalArabicToken();
  testExactArabicWordMatch();
  testDiacriticsAndAlefVariants();
  testNoCrossWordMatch();
  testNoPartialSubstringMatchInsideArabicWord();
  testNoFalsePositiveAcrossDifferentLetters();
  console.log("\nAll lexicon normalization tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
