import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const NARRATIVE_UNDERSTANDING_CONTRACT: V3ReasoningStageMetadata<"narrative_understanding"> = {
  name: "narrative_understanding",
  description: "Establish the story frame before any legal assessment.",
  purpose: "Understand what is happening in the local narrative context.",
  inputs: ["story_memory", "chunk", "subject", "glossary"],
  outputs: ["narrative_understanding"],
};

