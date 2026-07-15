export type PoliticsDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const POLITICS_DECISION_TREE: readonly PoliticsDecisionStep[] = Object.freeze([
  { step: 1, question: "Can a politics or state concept be identified?", yes: 2, no: "Lower Confidence" },
  { step: 2, question: "Is the text endorsing, inciting, glorifying, or evaluating the state context?", yes: 3, no: "Reject" },
  { step: 3, question: "Does context change the interpretation?", yes: "Evaluate Exceptions", no: "Proceed" },
]);
