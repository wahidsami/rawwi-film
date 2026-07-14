/**
 * Legacy/compatibility scaffold.
 *
 * Why this file exists:
 * - Preserves the older story-memory prompt text used by legacy V3 prompt assembly.
 * - Maintains compatibility for existing entry points that still import the older contract renderer.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. It does not perform reasoning.
 *
 * Backward compatibility:
 * - Retained intentionally for older prompt-generation call sites.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and full caller migration.
 */
export function renderV3StoryMemoryContract(storyMemory: string): string {
  return [
    "Story Memory (V3 placeholder):",
    storyMemory.trim().length > 0 ? storyMemory.trim() : "- not available",
    "- Use memory only as a narrative scaffold; keep evidence literal and current-chunk based.",
  ].join("\n");
}
