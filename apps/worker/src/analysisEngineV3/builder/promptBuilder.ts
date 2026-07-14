import { normalizePromptBuilderInput } from "./builderContext.js";
import { renderPromptHash, renderV3Prompt, renderV3RenderedPrompt } from "./promptRenderer.js";
import type { V3PromptBuilderInput, V3RenderedPrompt } from "./builderTypes.js";

export function buildV3Prompt(input: V3PromptBuilderInput): string {
  return renderV3Prompt(input);
}

export function buildV3RenderedPrompt(input: V3PromptBuilderInput): V3RenderedPrompt {
  return renderV3RenderedPrompt(input);
}

export function renderV3PromptHash(renderedPrompt: string): string {
  return renderPromptHash(renderedPrompt);
}

export function createV3PromptBuilderInputSnapshot(input: V3PromptBuilderInput): V3PromptBuilderInput {
  return normalizePromptBuilderInput(input);
}

