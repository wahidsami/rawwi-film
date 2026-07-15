export type CrimeDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const CRIME_DECISION_TREE: readonly CrimeDecisionStep[] = Object.freeze([
  { step: 1, question: "Can a crime concept be identified?", yes: 2, no: "Lower Confidence" },
  { step: 2, question: "Is the text describing, planning, executing, concealing, or reporting crime?", yes: 3, no: "Reject" },
  { step: 3, question: "Does context change the interpretation?", yes: "Evaluate Exceptions", no: "Proceed" },
]);
