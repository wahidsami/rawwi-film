import OpenAI from "openai";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import {
  attachV3ProviderError,
  createV3ProviderErrorDetails,
} from "./providerError.js";
import type { V3Provider, V3ProviderCallJudgeRawInput, V3ProviderRawResponse } from "./providerTypes.js";

export type OpenAIProviderOptions = Readonly<{
  apiKey?: string;
  timeoutMs?: number;
}>;

function normalizeNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function createOpenAIProvider(options?: OpenAIProviderOptions): V3Provider {
  const client = new OpenAI({ apiKey: options?.apiKey ?? config.OPENAI_API_KEY });
  const timeoutMs = options?.timeoutMs ?? config.JUDGE_TIMEOUT_MS;

  return {
    name: "openai",
    async callJudgeRaw(input: V3ProviderCallJudgeRawInput): Promise<V3ProviderRawResponse> {
      const startedAt = Date.now();
      logger.info("V3 instrumentation ENTER provider.call()", {
        modelName: input.modelName,
        promptTokenEstimate: input.promptTokenEstimate ?? null,
        maxTokens: input.maxTokens ?? null,
        retryAttempt: input.retryAttempt ?? null,
      });
      logger.info("V3 instrumentation ENTER: provider.callJudgeRaw (openai)", {
        modelName: input.modelName,
        promptTokenEstimate: input.promptTokenEstimate ?? null,
        maxTokens: input.maxTokens ?? null,
        retryAttempt: input.retryAttempt ?? null,
      });
      logger.info("AI Request Started", {
        modelName: input.modelName,
        promptTokenEstimate: input.promptTokenEstimate ?? null,
        maxTokens: input.maxTokens ?? null,
        retryAttempt: input.retryAttempt ?? null,
      });
      logger.info("V3 instrumentation SEND OpenAI request", {
        modelName: input.modelName,
        promptTokenEstimate: input.promptTokenEstimate ?? null,
        maxTokens: input.maxTokens ?? null,
        retryAttempt: input.retryAttempt ?? null,
      });
      try {
        const completion = await client.chat.completions.create(
          {
            model: input.modelName,
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.userPrompt },
            ],
            response_format: input.responseFormat === "text" ? undefined : { type: "json_object" },
            temperature: normalizeNumber(input.temperature),
            top_p: normalizeNumber(input.topP),
            seed: typeof input.seed === "number" && Number.isFinite(input.seed) ? input.seed : undefined,
            max_tokens: typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens) ? input.maxTokens : undefined,
          },
          { timeout: timeoutMs, signal: input.signal ?? undefined },
        );
        logger.info("AI Response Received", {
          modelName: input.modelName,
          promptTokenEstimate: input.promptTokenEstimate ?? null,
          maxTokens: input.maxTokens ?? null,
          retryAttempt: input.retryAttempt ?? null,
        });
        logger.info("V3 instrumentation RECEIVED OpenAI response", {
          modelName: input.modelName,
          promptTokenEstimate: input.promptTokenEstimate ?? null,
          maxTokens: input.maxTokens ?? null,
          retryAttempt: input.retryAttempt ?? null,
        });
        logger.info("V3 OpenAI completion snapshot", {
          modelName: input.modelName,
          response: {
            id: completion.id ?? null,
            object: completion.object ?? null,
            created: completion.created ?? null,
            model: completion.model ?? null,
            systemFingerprint: completion.system_fingerprint ?? null,
            choiceCount: completion.choices.length,
            choices: completion.choices.map((choice, index) => ({
              index,
              finishReason: choice.finish_reason ?? null,
              message: {
                role: choice.message?.role ?? null,
                content: choice.message?.content ?? null,
                refusal: (choice.message as { refusal?: string | null } | undefined)?.refusal ?? null,
              },
            })),
            usage: completion.usage
              ? {
                  promptTokens: completion.usage.prompt_tokens ?? null,
                  completionTokens: completion.usage.completion_tokens ?? null,
                  totalTokens: completion.usage.total_tokens ?? null,
                }
              : null,
          },
        });
        logger.info("V3 instrumentation EXIT: provider.callJudgeRaw (openai)", {
          modelName: input.modelName,
          durationMs: Date.now() - startedAt,
        });
        logger.info("V3 instrumentation EXIT provider.call()", {
          modelName: input.modelName,
          elapsedMs: Date.now() - startedAt,
        });

        return Object.freeze({
          providerName: "openai",
          modelName: input.modelName,
          modelVersion: null,
          rawResponse: completion.choices[0]?.message?.content ?? "{}",
          finishReason: completion.choices[0]?.finish_reason ?? null,
          usage: completion.usage
            ? Object.freeze({
                promptTokens: completion.usage.prompt_tokens ?? null,
                completionTokens: completion.usage.completion_tokens ?? null,
                totalTokens: completion.usage.total_tokens ?? null,
              })
            : null,
          responseId: completion.id ?? null,
          responseTimestamp: new Date().toISOString(),
        });
      } catch (error) {
        const providerError = createV3ProviderErrorDetails(error, {
          modelName: input.modelName,
          maxTokens: input.maxTokens,
          promptTokenEstimate: input.promptTokenEstimate,
          retryAttempt: input.retryAttempt,
        });
        logger.error("AI Failure", {
          modelName: input.modelName,
          aiFailureReason: providerError.message,
          aiFailureCode:
            providerError.httpStatus === 429 || /rate limit|quota|insufficient[_\s-]?quota|credit|billing|payment required|tokens per min|requests per min/i.test(providerError.message)
              ? "AI_QUOTA_EXCEEDED"
              : /timeout|timed out|etimedout|aborterror/i.test(providerError.message)
                ? "AI_TIMEOUT"
                : "AI_PROVIDER_UNAVAILABLE",
          provider_error: providerError,
        });
        logger.error("AI Failure Reason", {
          modelName: input.modelName,
          reason: providerError.message,
        });
        logger.error("V3 OpenAI provider call failed", {
          provider_error: providerError,
          modelName: input.modelName,
          promptTokenEstimate: input.promptTokenEstimate ?? null,
          maxTokens: input.maxTokens ?? null,
          retryAttempt: input.retryAttempt ?? null,
          elapsedMs: Date.now() - startedAt,
        });
        throw attachV3ProviderError(error instanceof Error ? error : new Error(providerError.message), providerError);
      }
    },
  };
}

export type { V3ProviderRawResponse } from "./providerTypes.js";
