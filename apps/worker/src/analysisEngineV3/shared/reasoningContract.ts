/**
 * Legacy/compatibility scaffold.
 *
 * Why this file exists:
 * - Preserves the older reasoning-contract text renderer for existing V3 prompt assembly paths.
 * - Helps keep legacy prompt exports stable during the transition to the newer V3 builder stack.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. This file is not the authoritative reasoning engine.
 *
 * Backward compatibility:
 * - Retained intentionally so older prompt-entry imports continue to resolve.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after all callers are migrated to the new builder path.
 */
export type V3ReasoningStage = {
  key: string;
  titleAr: string;
  purpose: string;
};

export const V3_REASONING_CONTRACT_STAGES: V3ReasoningStage[] = [
  { key: "narrative_understanding", titleAr: "Narrative Understanding", purpose: "Establish the local narrative frame." },
  { key: "speaker_identification", titleAr: "Speaker Identification", purpose: "Identify who is speaking when the text supports it." },
  { key: "target_identification", titleAr: "Target Identification", purpose: "Identify the target of the language or action." },
  { key: "narrative_intent", titleAr: "Narrative Intent", purpose: "Describe whether the text is literal, ironic, condemnatory, or descriptive." },
  { key: "story_position", titleAr: "Story Position", purpose: "Locate the text in the surrounding story or scene." },
  { key: "evidence_verification", titleAr: "Evidence Verification", purpose: "Confirm that the literal evidence exists in the chunk." },
  { key: "subject_evaluation", titleAr: "Subject Evaluation", purpose: "Evaluate the evidence against the active subject module." },
  { key: "exception_evaluation", titleAr: "Exception Evaluation", purpose: "Consider whether an exception or exclusion applies." },
  { key: "finding_construction", titleAr: "Finding Construction", purpose: "Assemble the candidate finding if the evidence survives review." },
  { key: "output_generation", titleAr: "Output Generation", purpose: "Render the final JSON output expected by the downstream parser." },
];

export function renderV3ReasoningContract(): string {
  return [
    "Reasoning Contract (placeholder):",
    ...V3_REASONING_CONTRACT_STAGES.map(
      (stage, index) => `${index + 1}. ${stage.titleAr} (${stage.key}) - ${stage.purpose}`,
    ),
  ].join("\n");
}
