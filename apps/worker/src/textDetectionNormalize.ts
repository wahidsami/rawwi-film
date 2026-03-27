import { canonicalArabicToken, findStringMatches } from "./lexiconCache.js";

const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;
const ARABIC_LETTER_GAP_RE = /(?<=[\u0621-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC\u06FF])\s+(?=[\u0621-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC\u06FF])/gu;

type NormalizeOptions = {
  stripPunctuation?: boolean;
};

function hasArabicChars(value: string): boolean {
  return ARABIC_CHAR_RE.test(value);
}

export function normalizeDetectionText(value: string, options: NormalizeOptions = {}): string {
  const input = value ?? "";
  let normalized = hasArabicChars(input)
    ? canonicalArabicToken(input)
    : input.normalize("NFC").toLowerCase();

  if (options.stripPunctuation) {
    normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, " ");
  }

  return normalized
    .replace(ARABIC_LETTER_GAP_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function includesNormalizedNeedle(
  sourceText: string,
  needle: string,
  options: NormalizeOptions = {}
): boolean {
  const rawNeedle = needle ?? "";
  if (hasArabicChars(rawNeedle)) {
    const termType = rawNeedle.trim().includes(" ") ? "phrase" : "word";
    const matched = findStringMatches(sourceText, rawNeedle, termType).length > 0;
    if (matched) return true;
    if (termType === "word") return false;
  }

  const normalizedNeedle = normalizeDetectionText(needle, options);
  if (!normalizedNeedle) return false;
  const normalizedSource = normalizeDetectionText(sourceText, options);
  return normalizedSource.includes(normalizedNeedle);
}

export function containsAnyNormalized(
  sourceText: string,
  needles: string[],
  options: NormalizeOptions = {}
): boolean {
  return needles.some((needle) => includesNormalizedNeedle(sourceText, needle, options));
}

export function isDetectionVerbatim(sourceText: string, snippet: string): boolean {
  if (!snippet || snippet.trim().length === 0) return false;
  if (includesNormalizedNeedle(sourceText, snippet)) return true;
  return includesNormalizedNeedle(sourceText, snippet, { stripPunctuation: true });
}
