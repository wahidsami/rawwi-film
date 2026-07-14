export type ViolenceDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const VIOLENCE_DECISION_TREE = Object.freeze<readonly ViolenceDecisionStep[]>([
  Object.freeze({
    step: 1,
    question: "Does the evidence describe violence or a violence-related concept?",
    yes: 2,
    no: "Reject",
  }),
  Object.freeze({
    step: 2,
    question: "Is the violence quoted, educational, historical, or condemned?",
    yes: "Reject",
    no: 3,
  }),
  Object.freeze({
    step: 3,
    question: "Is the violence self-defense, law enforcement, or justified force?",
    yes: "Needs Review",
    no: 4,
  }),
  Object.freeze({
    step: 4,
    question: "Does documentary or contextual framing change the interpretation?",
    yes: "Needs Review",
    no: "Accept",
  }),
]);
