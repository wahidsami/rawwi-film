import type { V3ReasoningMetrics, V3ReasoningTraceFinding } from "./reasoningTypes.js";

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function countSelected<T extends { selected: boolean }>(values: readonly T[]): number {
  return values.filter((value) => value.selected).length;
}

function countRejectionReasons(findings: readonly V3ReasoningTraceFinding[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    for (const issue of finding.validatorDecisions.grounding.issues) {
      const key = issue.code || issue.path || "grounding";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (!finding.validatorDecisions.scope.valid) {
      counts.set("reviewer_scope", (counts.get("reviewer_scope") ?? 0) + 1);
    }
    if (finding.validatorDecisions.mapping.droppedCount > 0) {
      counts.set("mapping_drop", (counts.get("mapping_drop") ?? 0) + 1);
    }
  }
  return Object.freeze(Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))));
}

export function buildV3ReasoningMetrics(findings: readonly V3ReasoningTraceFinding[]): V3ReasoningMetrics {
  const first = findings[0] ?? null;
  const reviewerCandidates = first?.reviewerCandidates ?? [];
  const articleCandidates = first?.articleCandidates ?? [];
  const atomCandidates = first?.atomCandidates ?? [];
  const selectedReviewers = countSelected(reviewerCandidates);
  const selectedArticles = countSelected(articleCandidates);
  const selectedAtoms = countSelected(atomCandidates);

  return Object.freeze({
    reviewerAccuracy: reviewerCandidates.length === 0 ? 0 : clampRatio(selectedReviewers / reviewerCandidates.length),
    articleAccuracy: articleCandidates.length === 0 ? 0 : clampRatio(selectedArticles / articleCandidates.length),
    atomAccuracy: atomCandidates.length === 0 ? 0 : clampRatio(selectedAtoms / atomCandidates.length),
    validatorRejectionReasons: countRejectionReasons(findings),
    promptSizeChars: first?.promptLengthChars ?? 0,
    promptTokens: first?.promptTokens ?? 0,
    decisionTimeline: Object.freeze(first?.decisionTimeline ?? []),
  });
}

