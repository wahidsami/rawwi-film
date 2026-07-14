export type ProfanityDecisionStep = {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
};

export const PROFANITY_DECISION_TREE: readonly ProfanityDecisionStep[] = [
  {
    id: "evidence_exists",
    title: "Verify evidence exists",
    purpose: "Confirm the evidence result contains an admissible candidate.",
  },
  {
    id: "admissibility",
    title: "Confirm admissibility",
    purpose: "Reject evidence that is missing, non-literal, or outside the chunk.",
  },
  {
    id: "literal_profanity",
    title: "Verify literal profanity",
    purpose: "Check whether the admissible evidence literally contains a profanity term or phrase from the V2 profanity policy.",
  },
  {
    id: "context_check",
    title: "Check contextual change",
    purpose: "Determine whether quotation, education, or condemnation changes interpretation enough to suppress classification.",
  },
  {
    id: "apply_rules",
    title: "Apply profanity rules",
    purpose: "Treat direct profanity as a finding when no exclusion applies.",
  },
  {
    id: "build_decision",
    title: "Produce decision",
    purpose: "Emit a deterministic legal decision and finding.",
  },
];

