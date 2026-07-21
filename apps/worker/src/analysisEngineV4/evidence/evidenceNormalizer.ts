import type { EvidenceSourceType } from "./evidenceTypes.js";

const DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED]/gu;

const PUNCTUATION_MAP: Readonly<Record<string, string>> = Object.freeze({
  "،": ",",
  "؛": ";",
  "؟": "?",
  "…": "...",
  "«": "\"",
  "»": "\"",
  "“": "\"",
  "”": "\"",
  "„": "\"",
  "‟": "\"",
  "‹": "'",
  "›": "'",
  "’": "'",
  "‘": "'",
  "‐": "-",
  "‑": "-",
  "–": "-",
  "—": "-",
  "ـ": "",
});

function normalizeUnicode(value: string): string {
  return value.normalize("NFC");
}

export function normalizeWhitespace(value: string): string {
  return normalizeUnicode(value).replace(/\s+/g, " ").trim();
}

export function normalizeArabicPunctuation(value: string): string {
  return normalizeWhitespace(value).replace(/[،؛؟…«»“”„‟‹›’‘‐‑–—ـ]/gu, (character) => PUNCTUATION_MAP[character] ?? character);
}

export function normalizeComparisonText(value: string): string {
  return normalizeArabicPunctuation(value)
    .replace(DIACRITICS_RE, "")
    .toLowerCase();
}

export type CompactText = Readonly<{
  compact: string;
  map: readonly number[];
}>;

export function buildCompactText(value: string): CompactText {
  const compactChars: string[] = [];
  const map: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (/[\p{L}\p{N}]/u.test(character)) {
      compactChars.push(character.normalize("NFC").toLowerCase());
      map.push(index);
    }
  }

  return Object.freeze({
    compact: compactChars.join(""),
    map: Object.freeze([...map]),
  });
}

export function isDialogueLike(value: string): boolean {
  return /[:«»"“”'«»]/u.test(value) || /^\s*[-–—]\s*/u.test(value) || /\b(?:قال|تقول|يقول|رد|سأل|أجاب|همس|صرخ)\b/u.test(value);
}

export function inferSourceType(text: string, fallback: EvidenceSourceType = "Description"): EvidenceSourceType {
  const normalized = normalizeComparisonText(text);
  if (/(?:voice\s*over|voiceover|راوي|تعليق صوتي)/iu.test(normalized)) {
    return "VoiceOver";
  }
  if (/(?:document|memo|report|letter|contract|file|وثيقة|تقرير|رسالة مكتوبة)/iu.test(normalized)) {
    return "Document";
  }
  if (/(?:screen|on screen|tv|television|monitor|display|الشاشة|على الشاشة)/iu.test(normalized)) {
    return "Screen";
  }
  if (/(?:phone|call|telephone|مكالمة|هاتف|اتصال)/iu.test(normalized)) {
    return "Phone";
  }
  if (/(?:message|sms|whatsapp|text|رسالة)/iu.test(normalized)) {
    return "Message";
  }
  if (/(?:post|social|tweet|facebook|instagram|x\.com|منشور)/iu.test(normalized)) {
    return "SocialPost";
  }
  if (/(?:sign|لافتة|لوحة|إشارة)/iu.test(normalized)) {
    return "Sign";
  }
  if (/(?:الراوي|نص|يصف|يشرح|يقدم)/u.test(normalized)) {
    return "Narration";
  }
  if (isDialogueLike(text)) {
    return "Dialogue";
  }
  if (fallback === "Action" || /(?:يدخل|يخرج|يدفع|يضرب|يجري|يمشي|يقف|يجلس|ينظر|يفتح|يغلق|يحمل|يسحب)/u.test(normalized)) {
    return "Action";
  }
  return fallback;
}

export function inferSpeaker(text: string): string | null {
  const match = text.match(/^\s*([^:\n]{1,40}?)\s*:/u);
  if (!match) {
    return null;
  }
  const speaker = normalizeWhitespace(match[1] ?? "");
  return speaker.length > 0 ? speaker : null;
}

export function inferTarget(participants: readonly string[]): string | null {
  return participants.length > 1 ? participants[1] ?? null : null;
}

export function inferSceneLabel(summary: string, heading: string | null): string {
  const cleanSummary = normalizeWhitespace(summary);
  if (cleanSummary.length > 0) {
    return cleanSummary;
  }
  return heading ? normalizeWhitespace(heading) : "";
}
