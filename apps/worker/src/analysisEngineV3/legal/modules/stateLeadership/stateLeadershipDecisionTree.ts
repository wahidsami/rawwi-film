export type StateLeadershipDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const STATE_LEADERSHIP_DECISION_TREE: readonly StateLeadershipDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there admissible evidence?",
    yes: 2,
    no: "Reject",
  }),
  Object.freeze({
    step: 2,
    question: "Does the chunk contain state leadership context or a literal attack?",
    yes: 3,
    no: "Reject",
  }),
  Object.freeze({
    step: 3,
    question: "Does a blocking context apply?",
    yes: "Reject or Review",
    no: "Accept",
  }),
]);

