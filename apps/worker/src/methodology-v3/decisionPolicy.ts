import type { HybridFindingLike } from "./contextArbiter.js";

const rank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const invRank: Record<number, string> = { 1: "low", 2: "medium", 3: "high", 4: "critical" };

function clampSeverity(level: number): string {
  const n = Math.max(1, Math.min(4, level));
  return invRank[n] ?? "medium";
}

/**
 * Deterministic policy merge:
 * - endorsement + rewarded narrative can escalate by 1
 * - condemnation + punished narrative can reduce by 1 (except hard blacklist)
 */
export function applyDecisionPolicy(findings: HybridFindingLike[]): HybridFindingLike[] {
  return findings.map((f) => {
    const base = rank[f.severity] ?? 2;
    const hardBlacklist = f.source === "lexicon_mandatory" && (f.lexical_confidence ?? 0) >= 0.99;
    const likelyNarrativeMention =
      !hardBlacklist &&
      f.depiction_type === "mention" &&
      (f.context_confidence ?? 0) >= 0.72 &&
      f.narrative_consequence !== "rewarded";
    let next = base;

    if (f.depiction_type === "endorsement" && f.narrative_consequence === "rewarded") next += 1;
    if (!hardBlacklist && f.depiction_type === "condemnation" && f.narrative_consequence === "punished") next -= 1;
    if (!hardBlacklist && f.depiction_type === "mention" && f.narrative_consequence === "neutralized") next -= 1;
    if (likelyNarrativeMention) next -= 1;

    const finalSeverity = clampSeverity(next);
    const final_ruling =
      hardBlacklist ? "violation"
      : f.depiction_type === "condemnation" && f.narrative_consequence === "punished" ? "context_ok"
      : likelyNarrativeMention ? "context_ok"
      : f.depiction_type === "mention" ? "needs_review"
      : (f.context_confidence ?? 0) < 0.5 ? "needs_review"
      : "violation";

    return {
      ...f,
      severity: finalSeverity,
      final_ruling,
      confidence: Math.max(0, Math.min(1, (f.confidence + (f.context_confidence ?? 0.55)) / 2)),
    };
  });
}
