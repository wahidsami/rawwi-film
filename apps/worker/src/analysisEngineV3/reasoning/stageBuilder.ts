import type { V3ReasoningContext } from "./reasoningContext.js";
import { getV3ReasoningStageSequence } from "./stages.js";
import type { V3ReasoningStageMetadata } from "./stageTypes.js";

export type V3ReasoningStageHandler = (
  context: V3ReasoningContext,
) => V3ReasoningContext | Promise<V3ReasoningContext>;

export type V3ReasoningPipelineStage = V3ReasoningStageMetadata & {
  handle: V3ReasoningStageHandler;
};

export class V3ReasoningStageBuilder {
  private readonly stages: V3ReasoningPipelineStage[] = [];

  addStage(stage: V3ReasoningPipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  addContractStages(): this {
    for (const stage of getV3ReasoningStageSequence()) {
      this.stages.push({
        ...stage,
        handle: async (context) => context,
      });
    }
    return this;
  }

  build(): V3ReasoningPipelineStage[] {
    return [...this.stages];
  }
}

export function createV3ReasoningStageBuilder(): V3ReasoningStageBuilder {
  return new V3ReasoningStageBuilder();
}

