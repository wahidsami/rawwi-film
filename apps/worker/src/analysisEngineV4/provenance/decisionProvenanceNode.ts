import type { DecisionProvenanceInput, DecisionProvenanceCollection } from "./decisionProvenanceTypes.js";
import { buildDecisionProvenanceCollection } from "./decisionProvenanceBuilder.js";

export function createDecisionProvenanceNode() {
  return (input: DecisionProvenanceInput): DecisionProvenanceCollection => buildDecisionProvenanceCollection(input);
}
