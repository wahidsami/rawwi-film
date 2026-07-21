import type { ExplanationCollection, ExplanationEngineInput } from "./explanationTypes.js";
import { buildExplanationCollection } from "./explanationBuilder.js";

export type ExplanationEngine = Readonly<{
  run: (input: ExplanationEngineInput) => ExplanationCollection;
}>;

export function createExplanationEngine(): ExplanationEngine {
  return Object.freeze({
    run(input: ExplanationEngineInput): ExplanationCollection {
      return buildExplanationCollection(input);
    },
  });
}

export { buildExplanationCollection } from "./explanationBuilder.js";
export { buildExplanationPrompt } from "./explanationPrompt.js";
export { validateExplanationCollection } from "./explanationValidator.js";
