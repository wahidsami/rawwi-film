/**
 * Legacy/compatibility scaffold.
 *
 * Why this file exists:
 * - Preserves the older glossary contract renderer used by legacy V3 prompt assembly.
 * - Keeps existing imports stable while the newer academy-driven knowledge layers remain in use.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. It does not participate in reasoning.
 *
 * Backward compatibility:
 * - Retained intentionally so older prompt composition continues to work.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and full migration to the newer knowledge-loading path.
 */
export type V3GlossaryEntry = {
  term: string;
  articleId: number;
  variants?: string[] | null;
};

export function renderV3GlossaryContract(entries: V3GlossaryEntry[]): string {
  if (entries.length === 0) {
    return [
      "Glossary (placeholder):",
      "- No glossary terms were supplied for this pass.",
    ].join("\n");
  }

  return [
    "Glossary (placeholder):",
    ...entries.map((entry) => {
      const variantText = entry.variants && entry.variants.length > 0 ? ` | variants: ${entry.variants.join(", ")}` : "";
      return `- ${entry.term} -> article ${entry.articleId}${variantText}`;
    }),
  ].join("\n");
}
