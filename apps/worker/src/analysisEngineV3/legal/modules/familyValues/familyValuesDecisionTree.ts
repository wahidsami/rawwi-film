export type FamilyValuesDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const FAMILY_VALUES_DECISION_TREE: readonly FamilyValuesDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there a family-related concept or anchor?",
    yes: 2,
    no: "Reject",
  }),
  Object.freeze({
    step: 2,
    question: "Is the evidence admissible and literal enough to review?",
    yes: 3,
    no: "Reject",
  }),
  Object.freeze({
    step: 3,
    question: "Is the family meaning harmful, humiliating, corrupting, neglectful, or glorifying harm?",
    yes: 4,
    no: "Reject",
  }),
  Object.freeze({
    step: 4,
    question: "Does the context create an exception that blocks the finding?",
    yes: "Review or Reject",
    no: "Accept",
  }),
]);
