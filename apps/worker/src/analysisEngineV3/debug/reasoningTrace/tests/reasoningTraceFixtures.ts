import {
  REASONING_TRACE_STAGE_ORDER,
  REASONING_TRACE_STAGE_TITLES,
  type ReasoningTraceStageDraft,
} from "../types/reasoningTraceTypes.js";

function buildStageDraft(
  stage: (typeof REASONING_TRACE_STAGE_ORDER)[number],
  index: number,
  variant: "expected" | "actual",
): ReasoningTraceStageDraft {
  const base = index + 1;
  const confidence = variant === "expected" ? 0.5 + base * 0.01 : 0.5 + base * 0.01;
  return Object.freeze({
    stage,
    title: REASONING_TRACE_STAGE_TITLES[stage],
    timestamp: new Date(Date.UTC(2000, 0, 1, 0, 0, base, 0)).toISOString(),
    inputs: Object.freeze([`${variant}-input-${stage}`]),
    outputs: Object.freeze([`${variant}-output-${stage}`]),
    confidence,
    supportingEvidence: Object.freeze([`${variant}-evidence-${stage}`]),
    knowledgeAssetsUsed: Object.freeze([`${variant}-asset-${stage}`]),
    lessonIds: Object.freeze([`lesson-${base.toString().padStart(3, "0")}`]),
    decisionRecordIds: Object.freeze([`decision-${base.toString().padStart(3, "0")}`]),
    patternIds: Object.freeze([`pattern-${base.toString().padStart(3, "0")}`]),
    benchmarkIds: Object.freeze([`benchmark-${base.toString().padStart(3, "0")}`]),
    reviewerMethodologyIds: Object.freeze([`methodology-${base.toString().padStart(3, "0")}`]),
    narrativeIds: Object.freeze([`narrative-${base.toString().padStart(3, "0")}`]),
    intentIds: Object.freeze([`intent-${base.toString().padStart(3, "0")}`]),
    relationshipIds: Object.freeze([`relationship-${base.toString().padStart(3, "0")}`]),
    judgmentIds: Object.freeze([`judgment-${base.toString().padStart(3, "0")}`]),
    gcamArticleIds: Object.freeze([100 + base]),
    gcamAtomIds: Object.freeze([`atom-${base.toString().padStart(3, "0")}`]),
    reason: `${variant} reason for ${stage}`,
  });
}

export function buildReasoningTraceFixtures(): Readonly<{
  expected: readonly ReasoningTraceStageDraft[];
  actual: readonly ReasoningTraceStageDraft[];
}> {
  const expected = REASONING_TRACE_STAGE_ORDER.map((stage, index) => buildStageDraft(stage, index, "expected"));
  const actual = REASONING_TRACE_STAGE_ORDER.map((stage, index) => buildStageDraft(stage, index, "actual"));

  const expectedFiltered = expected.filter((stage) => stage.stage !== "finding_generation");
  const actualFiltered = actual.filter((stage) => stage.stage !== "rejected_interpretations").map((stage) => {
    if (stage.stage === "concept_detection") {
      return Object.freeze({
        ...stage,
        outputs: Object.freeze(["actual-output-concept_detection", "actual-output-concept_detection-2"]),
        confidence: 0.91,
        reason: "actual reason for concept_detection",
      });
    }
    if (stage.stage === "reviewer_judgment") {
      return Object.freeze({
        ...stage,
        reason: "actual reason for reviewer_judgment",
        knowledgeAssetsUsed: Object.freeze([...(stage.knowledgeAssetsUsed ?? []), "actual-extra-asset"]),
      });
    }
    if (stage.stage === "gcam_mapping") {
      return Object.freeze({
        ...stage,
        lessonIds: Object.freeze(["lesson-021", "lesson-022"]),
        gcamArticleIds: Object.freeze([201, 202]),
        reason: "actual reason for gcam_mapping",
      });
    }
    return stage;
  });

  return Object.freeze({
    expected: Object.freeze(expectedFiltered),
    actual: Object.freeze(actualFiltered),
  });
}
