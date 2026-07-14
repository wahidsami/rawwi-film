import type { DecisionRecord } from "./decisionRecordTypes.js";

function indent(lines: readonly string[], prefix = "  "): string {
  return lines.map((line) => `${prefix}${line}`).join("\n");
}

function listOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "None";
}

function joinOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.join(" | ") : "None";
}

export function renderDecisionRecord(record: DecisionRecord): string {
  return [
    `Decision Record: ${record.title}`,
    `ID: ${record.id}`,
    `Version: ${record.version}`,
    `Confidence: ${record.confidence}`,
    `Finding Type: ${record.findingType}`,
    `Summary: ${record.summary}`,
    "",
    `Original Scenario: ${record.originalScenario}`,
    `Review Question: ${record.reviewQuestion}`,
    `Initial Suspicion: ${record.initialSuspicion}`,
    `Possible Concepts: ${listOrNone(record.possibleConcepts)}`,
    `Supporting Evidence: ${joinOrNone(record.supportingEvidence)}`,
    `Contradicting Evidence: ${joinOrNone(record.contradictingEvidence)}`,
    `Required Missing Evidence: ${joinOrNone(record.requiredMissingEvidence)}`,
    `Scene Context: ${record.sceneContext}`,
    `Speaker Analysis: ${record.speakerAnalysis}`,
    `Target Analysis: ${record.targetAnalysis}`,
    `Intent Analysis: ${record.intentAnalysis}`,
    "Reasoning Steps:",
    indent(record.reasoningSteps.map((step, index) => `${index + 1}. ${step}`)),
    `Reviewer Decision: ${record.reviewerDecision}`,
    `False Positive Risk: ${record.falsePositiveRisk}`,
    `Reviewer Notes: ${record.reviewerNotes}`,
    `Benchmark Tags: ${listOrNone(record.benchmarkTags)}`,
    `Related Lessons: ${listOrNone(record.relatedLessons)}`,
    `Related Patterns: ${listOrNone(record.relatedPatterns)}`,
    `Related Blueprint Concepts: ${listOrNone(record.relatedBlueprintConcepts)}`,
    "GCAM Mappings:",
    indent(
      record.gcamMappings.length > 0
        ? record.gcamMappings.map((mapping, index) => {
            const atomIds = mapping.atom_ids.length > 0 ? mapping.atom_ids.join(", ") : "None";
            const note = mapping.note ? `; note: ${mapping.note}` : "";
            return `${index + 1}. article ${mapping.article_id}; atoms: ${atomIds}${note}`;
          })
        : ["None"],
    ),
  ].join("\n");
}
