import { VALIDATION_FIXTURES } from "../fixtures/validationFixtures.js";

export const VALIDATION_EXPECTED_CASE_IDS = Object.freeze(VALIDATION_FIXTURES.map((caseItem) => caseItem.id));
export const VALIDATION_EXPECTED_CONCEPTS = Object.freeze(
  Object.fromEntries(VALIDATION_FIXTURES.map((caseItem) => [caseItem.id, caseItem.expectedConcepts])),
);
export const VALIDATION_EXPECTED_ATOMS = Object.freeze(
  Object.fromEntries(VALIDATION_FIXTURES.map((caseItem) => [caseItem.id, caseItem.expectedAtomId])),
);

