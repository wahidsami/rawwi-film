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
import { createReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import { createEmergencyContextualReviewerKnowledgeSelection } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import { buildReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import { validateReasonedDecisionAgainstEvidence } from "./reasonedDecisionValidation.js";

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
  const reviewerKnowledgeSelection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput: input,
    conceptContext,
    assessment: reviewerAssessment,
  });
  const reviewerKnowledgeRetrieval = createReviewerKnowledgeRetrievalReport({
    assessment: reviewerAssessment,
    conceptContext,
    subjectModule: input.subjectModule,
    registry: reviewerKnowledgeSelection.reviewerKnowledgeRegistry,
    topK: Math.max(1, reviewerKnowledgeSelection.routing.selectedReviewerPackIds.length),
  });
  const reviewerKnowledgePacks = reviewerKnowledgeRetrieval.selectedPacks;
  const reviewerReasoningEngine = buildReviewerReasoningEnginePayload(
    input,
    conceptContext,
    reviewerAssessment,
    reviewerKnowledgePacks,
    reviewerKnowledgeSelection.knowledgeRegistry,
    reviewerKnowledgeRetrieval,
  );

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

function appendValidationRepairInstruction(userPrompt: string, issues: readonly { path: string; message: string }[]): string {
  const issueLines = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");
  return [
    userPrompt,
    "",
    "Validation repair instruction:",
    "The previous answer failed post-generation validation.",
    "Revise only the reviewer reasoning package.",
    "Requirements:",
    "- Keep every claim grounded in the exact quoted evidence or current scene.",
    "- Evaluate every GCAM article independently and return PASS or FAIL for each one.",
    "- If no article passes, return NO VIOLATION.",
    "- Do not add facts, actors, objects, injuries, or events not present in the source evidence.",
    "Validation issues:",
    issueLines,
  ].join("\n");
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
  const validation = validateReasonedDecisionAgainstEvidence(input.promptInput, {
    prompt: renderedPrompt.prompt,
    promptHash: renderedPrompt.promptHash,
    userPrompt,
    rawResponse,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
    reasonedDecision: mapped.reasonedDecision,
  });

  if (!validation.valid) {
    const retryRawResponse = await input.provider.callJudgeRaw({
      systemPrompt: renderedPrompt.prompt,
      userPrompt: appendValidationRepairInstruction(userPrompt, validation.issues),
      modelName: input.modelName,
      temperature: input.temperature,
      topP: input.topP,
      seed: input.seed,
      maxTokens: input.maxTokens,
      responseFormat: input.responseFormat ?? "json_object",
      signal: input.signal ?? null,
    });
    const retryMapped = mapV3ProviderResponse(retryRawResponse.rawResponse);
    const retryValidation = validateReasonedDecisionAgainstEvidence(input.promptInput, {
      prompt: renderedPrompt.prompt,
      promptHash: renderedPrompt.promptHash,
      userPrompt: appendValidationRepairInstruction(userPrompt, validation.issues),
      rawResponse: retryRawResponse,
      narrative: retryMapped.narrative,
      evidence: retryMapped.evidence,
      semantic: retryMapped.semantic,
      context: retryMapped.context,
      reasonedDecision: retryMapped.reasonedDecision,
    });

    return Object.freeze({
      prompt: renderedPrompt.prompt,
      promptHash: renderedPrompt.promptHash,
      userPrompt: appendValidationRepairInstruction(userPrompt, validation.issues),
      rawResponse: retryRawResponse,
      narrative: retryMapped.narrative,
      evidence: retryMapped.evidence,
      semantic: retryMapped.semantic,
      context: retryMapped.context,
      reasonedDecision: retryValidation.valid ? retryMapped.reasonedDecision : retryValidation.sanitizedDecision,
    });
  }

  return Object.freeze({
    prompt: renderedPrompt.prompt,
    promptHash: renderedPrompt.promptHash,
    userPrompt,
    rawResponse,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
    reasonedDecision: mapped.reasonedDecision,
  });
}

export type { V3Provider, V3ProviderName, V3ProviderRawResponse, V3ProviderReasoningRequest, V3ProviderReasoningResult } from "./providerTypes.js";
