import type { V3DebugCollection, V3DebugReport, V3DebugSummary } from "./debugTypes.js";

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return "very high";
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  if (confidence >= 0.25) return "low";
  return "very low";
}

export function buildV3DebugSummary(collection: Pick<V3DebugCollection, "academy" | "intelligence" | "reviewer" | "legal" | "output"> & { general: V3DebugReport["general"] }): V3DebugSummary {
  const counts = Object.freeze({
    lessons: collection.academy.loadedLessons.length,
    reviewerPacks: collection.academy.loadedReviewerPacks.length,
    patternLibraries: collection.academy.loadedPatternLibraries.length,
    decisionRecords: collection.academy.loadedDecisionRecords.length,
    blueprints: collection.academy.loadedBlueprints.length,
    concepts: collection.intelligence.detectedConcepts.length,
    entities: collection.intelligence.detectedEntities.length,
    targets: collection.intelligence.detectedTargets.length,
    intents: collection.intelligence.detectedIntents.length,
    contexts: collection.intelligence.detectedContexts.length,
    evidenceItems: collection.reviewer.evidenceCollected.length,
    findings: collection.output.findings.length,
    observations: collection.output.observations.length,
  });

  const keyTakeaways = [
    `Loaded ${counts.lessons} lessons, ${counts.reviewerPacks} reviewer packs, ${counts.patternLibraries} pattern libraries, ${counts.decisionRecords} decision records, and ${counts.blueprints} blueprint groups.`,
    `Detected ${counts.concepts} concepts, ${counts.entities} entities, ${counts.targets} targets, ${counts.intents} intents, and ${counts.contexts} context signals.`,
    `Captured ${counts.evidenceItems} evidence items, ${counts.findings} findings, and ${counts.observations} observations.`,
  ];

  return Object.freeze({
    headline: `${collection.general.engineVersion.toUpperCase()} brain debug report for ${collection.general.model}`,
    counts,
    confidenceLabel: confidenceLabel(collection.output.confidence),
    keyTakeaways: Object.freeze(keyTakeaways),
  });
}

export function renderV3DebugSummary(summary: V3DebugSummary): string {
  return [
    "## Summary",
    "",
    `- Headline: ${summary.headline}`,
    `- Confidence: ${summary.confidenceLabel}`,
    `- Lessons: ${summary.counts.lessons}`,
    `- Reviewer Packs: ${summary.counts.reviewerPacks}`,
    `- Pattern Libraries: ${summary.counts.patternLibraries}`,
    `- Decision Records: ${summary.counts.decisionRecords}`,
    `- Blueprints: ${summary.counts.blueprints}`,
    `- Concepts: ${summary.counts.concepts}`,
    `- Entities: ${summary.counts.entities}`,
    `- Targets: ${summary.counts.targets}`,
    `- Intents: ${summary.counts.intents}`,
    `- Contexts: ${summary.counts.contexts}`,
    `- Evidence Items: ${summary.counts.evidenceItems}`,
    `- Findings: ${summary.counts.findings}`,
    `- Observations: ${summary.counts.observations}`,
    "",
    "### Key Takeaways",
    ...summary.keyTakeaways.map((item) => `- ${item}`),
  ].join("\n");
}
