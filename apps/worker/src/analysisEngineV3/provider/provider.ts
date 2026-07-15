import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { stableSerializePromptValue } from "../builder/builderContext.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { mapV3ProviderResponse } from "./responseMapper.js";
import type {
  V3Provider,
  V3ProviderName,
  V3ProviderReasoningResult,
  V3ProviderRawResponse,
} from "./providerTypes.js";
import { createPromptConceptContext, runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { getDefaultReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRegistry.js";
import { selectReviewerKnowledgePacks } from "../reviewerKnowledge/reviewerKnowledgeSelector.js";
import { buildReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";

export type V3ProviderFlowInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  provider: V3Provider;
  modelName: string;
  temperature?: number;
  topP?: number;
  seed?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  signal?: AbortSignal | null;
}>;

export function createV3Provider(provider: V3Provider): V3Provider {
  return provider;
}

export function buildV3ProviderUserPrompt(input: V3PromptBuilderInput): string {
  const conceptContext = createPromptConceptContext(input);
  const reviewerAssessment = runReviewerMethodology({ promptInput: input, conceptContext });
  const reviewerKnowledgePacks = selectReviewerKnowledgePacks(reviewerAssessment, conceptContext);
  const reviewerReasoningEngine = buildReviewerReasoningEnginePayload(input, conceptContext, reviewerAssessment, reviewerKnowledgePacks);

  return stableSerializePromptValue({
    chunkContext: input.chunkContext,
    glossary: input.glossary,
    reviewerReasoningEngine,
    reviewerAssessment,
    reviewerMethodology: getDefaultReviewerMethodology(),
    reviewerKnowledgePacks,
    outputSchema: input.outputSchema,
    reasoningContract: input.reasoningContract,
    semanticLayer: input.semanticLayer,
    storyMemory: input.storyMemory,
    subjectModule: {
      id: input.subjectModule.id,
      scope: input.subjectModule.scope ?? null,
      titleAr: input.subjectModule.titleAr,
    },
  });
}

export async function runV3ProviderReasoning(input: V3ProviderFlowInput): Promise<V3ProviderReasoningResult> {
  const renderedPrompt = buildV3RenderedPrompt(input.promptInput);
  const userPrompt = buildV3ProviderUserPrompt(input.promptInput);
  const rawResponse = await input.provider.callJudgeRaw({
    systemPrompt: renderedPrompt.prompt,
    userPrompt,
    modelName: input.modelName,
    temperature: input.temperature,
    topP: input.topP,
    seed: input.seed,
    maxTokens: input.maxTokens,
    responseFormat: input.responseFormat ?? "json_object",
    signal: input.signal ?? null,
  });
  const mapped = mapV3ProviderResponse(rawResponse.rawResponse);

  return Object.freeze({
    prompt: renderedPrompt.prompt,
    promptHash: renderedPrompt.promptHash,
    userPrompt,
    rawResponse,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
  });
}

export type { V3Provider, V3ProviderName, V3ProviderRawResponse, V3ProviderReasoningRequest, V3ProviderReasoningResult } from "./providerTypes.js";
