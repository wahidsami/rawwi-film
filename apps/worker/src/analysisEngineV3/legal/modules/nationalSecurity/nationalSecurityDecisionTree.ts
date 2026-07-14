export type NationalSecurityDecisionStep = Readonly<{
  step: number;
  question: string;
  yes: number | string;
  no: number | string;
}>;

export const NATIONAL_SECURITY_DECISION_TREE: readonly NationalSecurityDecisionStep[] = Object.freeze([
  Object.freeze({
    step: 1,
    question: "Is there admissible evidence?",
    yes: 2,
    no: "Reject",
  }),
  Object.freeze({
    step: 2,
    question: "Does the chunk contain national-security context or a literal attack?",
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

