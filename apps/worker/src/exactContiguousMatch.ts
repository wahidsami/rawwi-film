type Match = {
  matchedText: string;
  startIndex: number;
  endIndex: number;
  line: number;
  column: number;
};

function isWordLikeChar(char: string | undefined): boolean {
  return typeof char === "string" && /[\p{L}\p{N}]/u.test(char);
}

function getLineAndColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const column = (lines[lines.length - 1] ?? "").length + 1;
  return { line, column };
}

export function isExactContiguousSpan(sourceText: string, evidence: string): boolean {
  return typeof sourceText === "string" && typeof evidence === "string" && evidence.length > 0 && sourceText.includes(evidence);
}

export function findExactContiguousMatches(
  text: string,
  rawNeedle: string,
  termType: "word" | "phrase"
): Match[] {
  const needle = (rawNeedle ?? "").trim();
  if (!needle) return [];

  const results: Match[] = [];
  let pos = 0;
  while (pos <= text.length) {
    const idx = text.indexOf(needle, pos);
    if (idx < 0) break;
    const endIndex = idx + needle.length;
    const before = idx > 0 ? text[idx - 1] : undefined;
    const after = endIndex < text.length ? text[endIndex] : undefined;
    if (termType === "word" && (isWordLikeChar(before) || isWordLikeChar(after))) {
      pos = idx + 1;
      continue;
    }
    const { line, column } = getLineAndColumn(text, idx);
    results.push({ matchedText: text.slice(idx, endIndex), startIndex: idx, endIndex, line, column });
    pos = idx + Math.max(1, needle.length);
  }

  return results;
}
