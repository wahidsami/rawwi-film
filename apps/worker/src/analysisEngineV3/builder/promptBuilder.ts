import { normalizePromptBuilderInput } from "./builderContext.js";
import { renderPromptHash, renderV3Prompt, renderV3RenderedPrompt } from "./promptRenderer.js";
import type { V3PromptBuilderInput, V3RenderedPrompt } from "./builderTypes.js";
import { logger } from "../../logger.js";

export function buildV3Prompt(input: V3PromptBuilderInput): string {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: buildV3Prompt", {});
  const rendered = renderV3Prompt(input);
  logger.info("V3 instrumentation EXIT: buildV3Prompt", {
    durationMs: Date.now() - startedAt,
  });
  return rendered;
}

export function buildV3RenderedPrompt(input: V3PromptBuilderInput): V3RenderedPrompt {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: buildV3RenderedPrompt", {});
  const rendered = renderV3RenderedPrompt(input);
  logger.info("V3 instrumentation EXIT: buildV3RenderedPrompt", {
    durationMs: Date.now() - startedAt,
    promptCharacterCount: rendered.prompt.length,
    promptTokenEstimate: Math.max(1, Math.ceil(rendered.prompt.length / 4)),
    promptHash: rendered.promptHash,
  });
  return rendered;
}

export function renderV3PromptHash(renderedPrompt: string): string {
  return renderPromptHash(renderedPrompt);
}

export function createV3PromptBuilderInputSnapshot(input: V3PromptBuilderInput): V3PromptBuilderInput {
  return normalizePromptBuilderInput(input);
}
