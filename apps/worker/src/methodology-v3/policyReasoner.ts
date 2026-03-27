import type { HybridFindingLike } from "./contextArbiter.js";
import { normalizeDetectionText } from "../textDetectionNormalize.js";

export type PolicyReasoningResult = {
  findings: HybridFindingLike[];
  scriptSignals: {
    punishedCount: number;
    rewardedCount: number;
    unresolvedCount: number;
  };
};

const PUNISH_HINTS = ["عوقب", "حُوكم", "سُجن", "ندم", "اعتذر", "تحمل العواقب"];
const REWARD_HINTS = ["نجا", "كوفئ", "انتصر", "حقق مكاسب", "بدون عقاب"];

function countHints(text: string, hints: string[]): number {
  const normalizedText = normalizeDetectionText(text);
  let n = 0;
  for (const hint of hints) {
    if (!normalizedText.includes(normalizeDetectionText(hint))) continue;
    n++;
  }
  return n;
}

export function reasonPolicyAtScriptLevel(
  findings: HybridFindingLike[],
  fullText: string | null
): PolicyReasoningResult {
  const base = fullText ?? "";
  const punishedCount = countHints(base, PUNISH_HINTS);
  const rewardedCount = countHints(base, REWARD_HINTS);
  const unresolvedCount = Math.max(0, findings.length - punishedCount - rewardedCount);
  const narrative: HybridFindingLike["narrative_consequence"] =
    punishedCount > rewardedCount ? "punished"
    : rewardedCount > punishedCount ? "rewarded"
    : findings.length === 0 ? "neutralized"
    : "unresolved";

  return {
    findings: findings.map((f) => ({
      ...f,
      narrative_consequence: f.narrative_consequence ?? narrative ?? "unknown",
      policy_confidence: f.policy_confidence ?? 0.7,
    })),
    scriptSignals: { punishedCount, rewardedCount, unresolvedCount },
  };
}
