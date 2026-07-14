/**
 * Legacy/compatibility scaffold.
 *
 * Why this file exists:
 * - Keeps the earlier output-schema contract available for existing V3 prompt assembly paths.
 * - Preserves the older report contract wording while the newer builder stack remains in place.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. This is not a reasoning or mapping module.
 *
 * Backward compatibility:
 * - Retained intentionally for older prompt and schema consumers.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after all callers move to the new builder contract.
 */
export type V3OutputSchemaField = {
  name: string;
  description: string;
};

export const V3_OUTPUT_SCHEMA_FIELDS: V3OutputSchemaField[] = [
  { name: "findings", description: "Array of candidate findings emitted by the reasoning engine." },
  { name: "reasoning_trace", description: "Placeholder trace showing the reasoning stages that were considered." },
];

export function renderV3OutputSchemaContract(): string {
  return [
    "Output Schema Contract (placeholder):",
    "- findings: []",
    "- reasoning_trace: []",
    "- The concrete output shape will remain compatible with the existing post-processing pipeline.",
  ].join("\n");
}
