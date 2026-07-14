/**
 * Compatibility wrapper.
 *
 * Why this file exists:
 * - Bridges the older prompt-prelude assembly path to the newer builder stack.
 * - Preserves the historical V3 entry point used by existing imports.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. The canonical prompt builder lives in the newer builder module.
 *
 * Backward compatibility:
 * - Retained intentionally for older prompt-entry imports.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and once all callers use the canonical builder path.
 */
import type { V3GlossaryEntry } from "../glossary/index.js";
import { renderV3GlossaryContract } from "../glossary/index.js";
import { renderV3OutputSchemaContract } from "../contracts/outputSchema.js";
import { renderV3ReasoningContract } from "../shared/reasoningContract.js";
import { renderV3StoryMemoryContract } from "../shared/storyMemory.js";
import { renderV3SubjectCatalog } from "../subjects/index.js";
import { joinNonEmptySections } from "../utils/sections.js";

export type V3PromptBuilderInput = {
  activeRoute: string;
  storyMemory: string;
  glossaryEntries: V3GlossaryEntry[];
  chunkSummary: string;
};

export function buildV3PromptPrelude(input: V3PromptBuilderInput): string {
  return joinNonEmptySections([
    "=== Analysis Engine V3 Scaffold ===",
    renderV3ReasoningContract(),
    renderV3SubjectCatalog(),
    `Active route placeholder: ${input.activeRoute}`,
    renderV3StoryMemoryContract(input.storyMemory),
    renderV3GlossaryContract(input.glossaryEntries),
    input.chunkSummary.trim().length > 0 ? `Chunk Context (placeholder):\n${input.chunkSummary.trim()}` : "Chunk Context (placeholder): not available",
    renderV3OutputSchemaContract(),
  ]);
}
