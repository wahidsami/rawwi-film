export type SexualityDecisionStep = Readonly<{
  readonly step: number;
  readonly question: string;
  readonly yes?: number | string;
  readonly no?: number | string;
}>;

export const SEXUALITY_DECISION_TREE: readonly SexualityDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there sexual evidence or a sexual concept?",
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
    question: "Is the context quoted, educational, medical, historical, documentary, or judicial?",
    yes: "Reject",
    no: 4,
  }),
  Object.freeze({
    step: 4,
    question: "Is the context artistic, fictional, dreamlike, flashback, or role-play?",
    yes: "Needs Review",
    no: "Accept",
  }),
]);
