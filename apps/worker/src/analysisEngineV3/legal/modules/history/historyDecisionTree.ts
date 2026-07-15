export type HistoryDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const HISTORY_DECISION_TREE: readonly HistoryDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there a historical anchor or claim?",
    yes: 2,
    no: "Reject",
  }),
  Object.freeze({
    step: 2,
    question: "Is the claim fabricated, distorted, misleading, or falsely documentary?",
    yes: 3,
    no: "Reject",
  }),
  Object.freeze({
    step: 3,
    question: "Does the context convert the claim into a quoted or clearly framed discussion?",
    yes: 4,
    no: "Accept",
  }),
  Object.freeze({
    step: 4,
    question: "Is the quote or discussion itself the false historical claim?",
    yes: "Accept",
    no: "Needs Review",
  }),
]);
