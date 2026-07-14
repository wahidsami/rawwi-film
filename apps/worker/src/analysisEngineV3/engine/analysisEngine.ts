import type { V3PipelineResult } from "../pipeline/pipelineResult.js";
import type { V3PipelineChunk, V3PipelineInput } from "../pipeline/pipelineTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { createAnalysisDiagnostics } from "./analysisDiagnostics.js";
import { toPromptBuilderInput, type AnalysisRequest } from "./analysisRequest.js";
import type { AnalysisEngineConfig } from "./analysisConfig.js";
import type { AnalysisResponse } from "./analysisResponse.js";

export type AnalysisEngineDependencies = Readonly<{
  config: AnalysisEngineConfig;
  buildPrompt: (input: V3PromptBuilderInput) => { prompt: string; promptHash: string };
  runPipeline: (input: V3PipelineInput) => V3PipelineResult;
}>;

export type AnalysisEngine = Readonly<{
  analyze: (request: AnalysisRequest) => AnalysisResponse;
}>;

function freezeObject<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      if (nested && typeof nested === "object") freezeObject(nested);
    }
    return Object.freeze(value);
  }
  return value;
}

export function createAnalysisEngine(dependencies: AnalysisEngineDependencies): AnalysisEngine {
  return {
    analyze(request: AnalysisRequest): AnalysisResponse {
      const effectiveConfig = {
        ...dependencies.config,
        ...request.config,
        diagnostics: request.config?.diagnostics ?? dependencies.config.diagnostics,
      } satisfies AnalysisEngineConfig;
      const hooks = effectiveConfig.hooks;

      hooks?.beforePromptBuild?.({ request });

      const promptInput: V3PromptBuilderInput = toPromptBuilderInput(request, {
        reasoningContract: effectiveConfig.reasoningContract,
        decisionGraph: effectiveConfig.decisionGraph,
        semanticLayer: effectiveConfig.semanticLayer,
      });

      const renderedPrompt = dependencies.buildPrompt(promptInput);
      hooks?.afterPromptBuild?.({ request, promptHash: renderedPrompt.promptHash });
      hooks?.beforePipeline?.({ request, promptHash: renderedPrompt.promptHash });

      const pipelineResult = dependencies.runPipeline({
        moduleId: request.subjectModule.id,
        chunk: {
          text: request.chunk.text,
          startOffset: request.chunk.startOffset,
          endOffset: request.chunk.endOffset,
          chunkIndex: request.chunk.chunkIndex,
          storyMemory: request.storyMemory,
          sceneMemory: request.sceneMemory,
          neighboringSentences: request.neighboringSentences,
          metadata: {
            analysisModuleId: request.subjectModule.id,
            outputSchemaTitle: request.outputSchema.title,
          },
        },
        glossary: request.glossary,
        registry: effectiveConfig.registry,
        diagnostics: { enabled: Boolean(effectiveConfig.diagnostics?.enabled) },
      });
      hooks?.afterPipeline?.({ request, promptHash: renderedPrompt.promptHash, pipelineResult });

      const diagnostics = createAnalysisDiagnostics({
        promptHash: renderedPrompt.promptHash,
        stageHashes: pipelineResult.stageHashes,
        stageTimings: pipelineResult.stageTimings,
        semantic: pipelineResult.semantic,
        legalDecision: pipelineResult.legalDecision,
      });
      const semanticHash = diagnostics.semanticHash;
      const legalHash = diagnostics.legalHash;

      const response: AnalysisResponse = {
        promptHash: renderedPrompt.promptHash,
        semanticHash,
        legalHash,
        stageHashes: pipelineResult.stageHashes,
        stageTimings: pipelineResult.stageTimings,
        narrative: pipelineResult.narrative,
        evidence: pipelineResult.evidence,
        semantic: pipelineResult.semantic,
        context: pipelineResult.context,
        intelligence: pipelineResult.intelligence,
        legalDecision: pipelineResult.legalDecision,
        diagnostics,
      };

      hooks?.afterAnalysis?.({ request, promptHash: renderedPrompt.promptHash, pipelineResult, response });

      return freezeObject(response);
    },
  };
}
