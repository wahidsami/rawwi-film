import type { V3PromptBuilderInput, V3PromptJsonObject, V3PromptJsonValue } from "../builder/builderTypes.js";
import type { LegalContextResult, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";

export type V3ProviderName = "openai" | "gemini" | "local";

export type V3ProviderCallJudgeRawInput = Readonly<{
  systemPrompt: string;
  userPrompt: string;
  modelName: string;
  temperature?: number;
  topP?: number;
  seed?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  signal?: AbortSignal | null;
}>;

export type V3ProviderRawResponse = Readonly<{
  providerName: V3ProviderName;
  modelName: string;
  modelVersion: string | null;
  rawResponse: string;
  finishReason: string | null;
  usage: Readonly<{
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  }> | null;
  responseId: string | null;
  responseTimestamp: string | null;
}>;

export type V3Provider = Readonly<{
  name: V3ProviderName;
  callJudgeRaw: (input: V3ProviderCallJudgeRawInput) => Promise<V3ProviderRawResponse>;
}>;

export type V3ProviderReasoningRequest = Readonly<{
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

export type V3ProviderReasoningResult = Readonly<{
  prompt: string;
  promptHash: string;
  userPrompt: string;
  rawResponse: V3ProviderRawResponse;
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
}>;

export type V3ReasoningResponsePayload = Readonly<{
  narrative?: V3PromptJsonObject | null;
  narrative_result?: V3PromptJsonObject | null;
  narrativeResult?: V3PromptJsonObject | null;
  evidence?: V3PromptJsonObject | null;
  evidence_result?: V3PromptJsonObject | null;
  evidenceResult?: V3PromptJsonObject | null;
  semantic?: V3PromptJsonObject | null;
  semantic_result?: V3PromptJsonObject | null;
  semanticResult?: V3PromptJsonObject | null;
  context?: V3PromptJsonObject | null;
  context_result?: V3PromptJsonObject | null;
  contextResult?: V3PromptJsonObject | null;
  reasoning?: V3PromptJsonObject | null;
  metadata?: V3PromptJsonObject | null;
  [key: string]: V3PromptJsonValue | undefined;
}>;
