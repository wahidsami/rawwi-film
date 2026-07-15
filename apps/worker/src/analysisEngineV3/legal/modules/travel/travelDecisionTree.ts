export type TravelDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const TRAVEL_DECISION_TREE: readonly TravelDecisionStep[] = Object.freeze([
  { step: 1, question: "Can a travel or country concept be identified?", yes: 2, no: "Lower Confidence" },
  { step: 2, question: "Is the text evaluative or simply observational?", yes: 3, no: "Reject" },
  { step: 3, question: "Does context change the interpretation?", yes: "Evaluate Exceptions", no: "Proceed" },
]);
