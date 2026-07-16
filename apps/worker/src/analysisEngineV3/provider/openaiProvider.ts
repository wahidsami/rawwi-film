import OpenAI from "openai";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
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
      });
      logger.info("V3 instrumentation ENTER: provider.callJudgeRaw (openai)", {
        modelName: input.modelName,
      });
      logger.info("V3 instrumentation SEND OpenAI request", {
        modelName: input.modelName,
      });
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
      logger.info("V3 instrumentation RECEIVED OpenAI response", {
        modelName: input.modelName,
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
    },
  };
}

export type { V3ProviderRawResponse } from "./providerTypes.js";
