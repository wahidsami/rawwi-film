import type { ConceptContext } from "./conceptTypes.js";

export type ConceptValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ConceptValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ConceptValidationIssue[];
}>;

export type ConceptValidationInput = ConceptContext;

