export type DrugsDecisionStep = Readonly<{
  readonly step: number;
  readonly question: string;
  readonly yes?: number | string;
  readonly no?: number | string;
}>;

export const DRUGS_DECISION_TREE: readonly DrugsDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there a drug-related concept or literal signal?",
    yes: 2,
    no: "Reject",
  }),
  Object.freeze({
    step: 2,
    question: "Is the evidence admissible?",
    yes: 3,
    no: "Reject",
  }),
  Object.freeze({
    step: 3,
    question: "Is the context medical, educational, rehabilitation, historical, documentary, or judicial?",
    yes: "Reject",
    no: 4,
  }),
  Object.freeze({
    step: 4,
    question: "Is the context promotional, manufacturing, trafficking, or consumption?",
    yes: "Accept",
    no: "Needs Review",
  }),
]);
