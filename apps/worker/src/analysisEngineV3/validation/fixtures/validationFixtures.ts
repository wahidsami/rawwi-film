import type { ValidationCase } from "../types/validationTypes.js";
import { BENCHMARK_CASES } from "../../benchmark/benchmarkCases.js";

const VALIDATION_CASE_IDS = new Set([
  "profanity-01",
  "profanity-02",
  "profanity-03",
  "profanity-04",
  "profanity-05",
  "profanity-06",
  "profanity-07",
  "profanity-08",
  "profanity-09",
  "profanity-10",
]);

function normalizeCase(caseItem: (typeof BENCHMARK_CASES)[number]): ValidationCase {
  return Object.freeze({
    ...caseItem,
    expectedAtomId: null,
  });
}

export const VALIDATION_FIXTURES: readonly ValidationCase[] = Object.freeze(
  BENCHMARK_CASES.filter((caseItem) => VALIDATION_CASE_IDS.has(caseItem.id)).map(normalizeCase),
);

