export type ReligionDecisionStep = Readonly<{
  id: string;
  title: string;
  purpose: string;
}>;

export const RELIGION_DECISION_TREE: readonly ReligionDecisionStep[] = Object.freeze([
  {
    id: "evidence_exists",
    title: "Verify evidence exists",
    purpose: "Confirm the evidence result contains an admissible primary candidate.",
  },
  {
    id: "admissibility",
    title: "Confirm admissibility",
    purpose: "Reject missing, indirect, or non-chunk evidence before applying religion rules.",
  },
  {
    id: "religion_signal",
    title: "Verify religion signal",
    purpose: "Check that the text literally references religion, sanctities, prophets, holy books, or sectarian harm.",
  },
  {
    id: "context_check",
    title: "Check contextual change",
    purpose: "Determine whether quotation, education, history, documentary framing, or condemnation changes interpretation enough to suppress classification.",
  },
  {
    id: "apply_rules",
    title: "Apply religion rules",
    purpose: "Classify direct religion harm as a finding when no blocking exception applies.",
  },
  {
    id: "build_decision",
    title: "Produce decision",
    purpose: "Emit a deterministic legal decision and finding.",
  },
]);
