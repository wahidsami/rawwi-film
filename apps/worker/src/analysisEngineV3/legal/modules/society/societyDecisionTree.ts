export type SocietyDecisionStep = Readonly<{
  readonly step: number;
  readonly question: string;
  readonly yes?: number | string;
  readonly no?: number | string;
}>;

export const SOCIETY_DECISION_TREE: readonly SocietyDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there a society or identity-related concept?",
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
    question: "Is the context quoted, educational, documentary, historical, news, or judicial?",
    yes: "Reject",
    no: 4,
  }),
  Object.freeze({
    step: 4,
    question: "Is the scene discriminatory, hateful, bullying, humiliating, tribal, or sectarian?",
    yes: "Accept",
    no: "Needs Review",
  }),
]);
