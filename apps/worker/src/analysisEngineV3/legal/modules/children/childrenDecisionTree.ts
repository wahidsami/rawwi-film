export type ChildrenDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const CHILDREN_DECISION_TREE: readonly ChildrenDecisionStep[] = Object.freeze([
  { step: 1, question: "Can a child or vulnerable person be identified?", yes: 2, no: "Lower Confidence" },
  { step: 2, question: "Is there evidence of harm, exploitation, grooming, neglect, violence, or crime?", yes: 3, no: "Reject" },
  { step: 3, question: "Does context change the interpretation?", yes: "Evaluate Exceptions", no: "Proceed" },
]);

