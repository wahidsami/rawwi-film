/**
 * Tests for conservative detector pass gating.
 * Run: npx tsx src/passGating.test.ts
 */
import { evaluatePassGating } from "./passGating.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testExpensivePassSkipsWithoutSignals() {
  const decision = evaluatePassGating("sexual_content", "جلس الجميع في المكتب لمراجعة الحسابات.", "gpt-4.1");
  assert(decision.shouldRun === false, "expected sexual_content to skip on neutral office text");
  assert(decision.reason === "no_signals", `expected no_signals, got ${decision.reason}`);
  console.log("✓ expensive pass skips when no relevant signals exist");
}

function testExpensivePassRunsWithArabicSignal() {
  const decision = evaluatePassGating("sexual_content", "اقترب منها ثم تبادلا قبلة سريعة قبل أن يبتعد.", "gpt-4.1");
  assert(decision.shouldRun === true, "expected sexual_content to run when sexual signal exists");
  assert(decision.matchedSignals.includes("قبلة"), `expected matchedSignals to include قبلة, got ${decision.matchedSignals.join(", ")}`);
  console.log("✓ expensive pass runs when direct Arabic signal exists");
}

function testExpensivePassRunsWithObfuscatedArabicSignal() {
  const decision = evaluatePassGating("extremism_banned_groups", "كان الخطاب يبرر ا ر ه ا ب الجماعة.", "gpt-4.1");
  assert(decision.shouldRun === true, "expected extremism pass to run on obfuscated Arabic signal");
  assert(decision.matchedSignals.some((v) => v === "إرهاب" || v === "ارهاب"), "expected terrorism signal to match");
  console.log("✓ expensive pass catches obfuscated Arabic trigger terms");
}

function testCheapPassAlwaysRuns() {
  const decision = evaluatePassGating("insults", "نص عادي بلا إشارات خاصة.", "gpt-4.1-mini");
  assert(decision.shouldRun === true, "expected cheap insults pass to remain always-on");
  assert(decision.reason === "always_on", `expected always_on, got ${decision.reason}`);
  console.log("✓ cheap passes remain always-on");
}

async function main() {
  testExpensivePassSkipsWithoutSignals();
  testExpensivePassRunsWithArabicSignal();
  testExpensivePassRunsWithObfuscatedArabicSignal();
  testCheapPassAlwaysRuns();
  console.log("\nAll pass gating tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
