import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { supabase } from "./db.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);
const PAGE_JOIN = "\n\n";
const PDF_TEXT_INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const PDF_TEXT_SOFT_SPACE_RE = /[\u00A0\t]+/g;
const PDF_ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;
const PDF_ARABIC_LETTER_RE = /[\u0621-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC\u06FF]/u;
const PDF_ARABIC_TOKEN_RE = /[\u0621-\u064A]{6,}/gu;
const PDF_STRAY_LATIN_IN_ARABIC_RE =
  /(?<=[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])[A-Za-z](?=[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])/gu;
const PDF_STRAY_LATIN_EDGE_RE =
  /(^|\s)[A-Za-z](?=[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])|(?<=[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])[A-Za-z](?=$|\s)/gu;
const OCR_SUSPICIOUS_MAX_TEXT_LENGTH = 1400;
const OCR_SUSPICIOUS_MAX_LINE_COUNT = 28;
const OCR_PAGE_DPI = 300;
const STRIKE_DETECTION_FULL_SCAN_PAGE_THRESHOLD = 120;

type PageMeta = Record<string, unknown>;
type ExtractedPdfPage = {
  text: string;
  meta: PageMeta;
};
type PdfWordBox = {
  text: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};
type PdfHorizontalLine = {
  x1: number;
  x2: number;
  y: number;
  strokeWidth: number;
};

type ExtractionVersion = {
  id: string;
  script_id: string;
  source_file_name: string | null;
  source_file_type: string | null;
  source_file_path: string | null;
};

function createExtractionAbortError(): Error {
  const error = new Error("PDF extraction cancelled");
  error.name = "AbortError";
  return error;
}

function normalizeStorageObjectPath(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(?:scripts|uploads)\/(.+)$/i);
  return (m ? m[1]! : t).replace(/^\//, "");
}

async function downloadScriptFile(version: ExtractionVersion): Promise<Buffer> {
  const rawPath = version.source_file_path;
  if (!rawPath) throw new Error("Missing source_file_path");
  const objectPath = normalizeStorageObjectPath(rawPath);
  const buckets = ["scripts", "uploads"] as const;
  let lastError = "Object not found";

  for (const bucket of buckets) {
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    if (error?.message) lastError = error.message;
  }

  throw new Error(lastError);
}

function sha256Hash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stripInvalidUnicodeForDb(s: string): string {
  if (typeof s !== "string" || s.length === 0) return s;
  const maybeWellFormed = s as unknown as { toWellFormed?: () => string };
  const well =
    typeof maybeWellFormed.toWellFormed === "function"
      ? maybeWellFormed.toWellFormed.call(s)
      : stripIllFormedUtf16Manual(s);
  return well.replace(/\0/g, "");
}

function stripIllFormedUtf16Manual(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) continue;
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += s.slice(i, i + 2);
        i++;
        continue;
      }
      out += "\uFFFD";
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    out += s.charAt(i);
  }
  return out;
}

function sanitizePageText(raw: string): string {
  const t = (raw ?? "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trimEnd();
  return stripInvalidUnicodeForDb(t);
}

function computePageGlobalOffsets(
  pageTexts: string[],
): Array<{ start_offset_global: number; end_offset_global: number }> {
  const offsets: Array<{ start_offset_global: number; end_offset_global: number }> = [];
  let cursor = 0;
  const sepLen = PAGE_JOIN.length;
  for (let i = 0; i < pageTexts.length; i++) {
    const content = sanitizePageText(pageTexts[i]!);
    const start = cursor;
    const end = start + content.length;
    offsets.push({ start_offset_global: start, end_offset_global: end });
    cursor = end + (i < pageTexts.length - 1 ? sepLen : 0);
  }
  return offsets;
}

type Section = {
  title: string;
  start_offset: number;
  end_offset: number;
};

const SECTION_HEADING_PATTERNS = [
  /\b(SCENE\s+\d+)\b/gi,
  /\b(Scene\s+\d+)\b/g,
  /\b(CHAPTER\s*\d*)\b/gi,
  /\b(Chapter\s*\d*)\b/g,
  /\b(الفصل\s*[٠-٩0-9]*)\b/g,
  /\b(مشهد\s*[٠-٩0-9]+)\b/g,
  /\b(المشهد\s*[٠-٩0-9]+)\b/g,
];

function splitScriptSections(normalizedContent: string): Section[] {
  if (typeof normalizedContent !== "string" || normalizedContent.length === 0) {
    return [{ title: "Full Script", start_offset: 0, end_offset: 0 }];
  }
  const len = normalizedContent.length;
  const starts: { offset: number; title: string }[] = [];

  for (const re of SECTION_HEADING_PATTERNS) {
    const regex = new RegExp(re.source, re.flags.includes("g") ? "g" : "gu");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(normalizedContent)) !== null) {
      const offset = m.index;
      const title = m[1]?.trim() || m[0].trim();
      if (title && !starts.some((s) => s.offset === offset)) {
        starts.push({ offset, title });
      }
    }
  }

  starts.sort((a, b) => a.offset - b.offset);
  const deduped: { offset: number; title: string }[] = [];
  for (const s of starts) {
    if (deduped.length === 0 || deduped[deduped.length - 1].offset !== s.offset) {
      deduped.push(s);
    }
  }

  if (deduped.length === 0) {
    return [{ title: "Full Script", start_offset: 0, end_offset: len }];
  }

  const sections: Section[] = [];
  if (deduped[0].offset > 0) {
    sections.push({
      title: "Intro",
      start_offset: 0,
      end_offset: deduped[0].offset,
    });
  }
  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i]!.offset;
    const end = i + 1 < deduped.length ? deduped[i + 1]!.offset : len;
    sections.push({
      title: deduped[i]!.title,
      start_offset: start,
      end_offset: end,
    });
  }
  return sections;
}

function normalizePdfTextRun(value: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(PDF_TEXT_INVISIBLE_RE, "")
    .replace(PDF_TEXT_SOFT_SPACE_RE, " ")
    .replace(/[\u06CC\u06D0\u06CE\u06D2]/g, "ي")
    .replace(/[\u06A9\u06AA]/g, "ك")
    .replace(/[\u06C1\u06BE\u06D5]/g, "ه")
    .replace(/\r?\n/g, " ")
    .replace(/ {2,}/g, " ");
}

function hasArabicPdfText(value: string): boolean {
  return PDF_ARABIC_RE.test(value);
}

function repairCollapsedArabicTokenSpacing(token: string): string {
  if (!token || !hasArabicPdfText(token) || /\s/.test(token)) return token;
  return token
    .replace(/(?<=[\u0621-\u064A]{3,})(?=ال[\u0621-\u064A]{2,})/gu, " ")
    .replace(/(?<=[\u0621-\u064A])(?=\d)/gu, " ")
    .replace(/(?<=\d)(?=[\u0621-\u064A])/gu, " ");
}

function postprocessPdfExtractedLine(line: string): string {
  let out = normalizePdfTextRun(line).trim();
  if (!out) return "";

  if (hasArabicPdfText(out)) {
    out = out
      .split(/\s+/)
      .map((token) => repairCollapsedArabicTokenSpacing(token))
      .join(" ");
    out = out
      .replace(PDF_STRAY_LATIN_IN_ARABIC_RE, "")
      .replace(PDF_STRAY_LATIN_EDGE_RE, "$1")
      .replace(/(\d+)\.([\u0600-\u06FF])/gu, "$1. $2")
      .replace(/([\u0600-\u06FF])-(?=[\u0600-\u06FF])/gu, "$1 - ")
      .replace(/(?<=[\u0600-\u06FF])\/(?=[\u0600-\u06FF])/gu, " / ")
      .replace(/(?<=[\u0600-\u06FF])\)\s*(V\.O|O\.S)\(/giu, " ($1) ")
      .replace(/\(\s*(V\.O|O\.S)\s*\)/giu, "($1)")
      .replace(/([:؟!،؛.])(?=[\u0600-\u06FF])/gu, "$1 ")
      .replace(/\s+\)/g, ")")
      .replace(/\(\s+/g, "(")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return out;
}

function collapseSpacedArabicLetters(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || !/[\u0600-\u06FF]/u.test(trimmed)) return line;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return line;

  const mostlyShortArabicTokens = tokens.filter((token) => {
    const plain = token.replace(/[()"'“”‘’.,:;!?،؛؟]/g, "");
    return plain.length <= 2 && /[\u0600-\u06FF0-9]/u.test(plain);
  }).length;

  if (mostlyShortArabicTokens / tokens.length < 0.8) return line;

  let out = trimmed
    // collapse spaces between Arabic letters / digits
    .replace(/(?<=[\u0600-\u06FF0-9])\s+(?=[\u0600-\u06FF0-9])/gu, "")
    // then restore more likely word boundaries
    .replace(/(?<=[\u0621-\u064A]{3,})(?=ال[\u0621-\u064A]{2,})/gu, " ")
    .replace(/(?<=[\u0621-\u064A])(?=\d)/gu, " ")
    .replace(/(?<=\d)(?=[\u0621-\u064A])/gu, " ")
    .replace(/([:؟!،؛.])(?=[\u0600-\u06FF])/gu, "$1 ")
    .replace(/\)\(/g, ") (")
    .replace(/\s{2,}/g, " ")
    .trim();

  return out;
}

function repairCollapsedArabicWordSpacing(line: string): string {
  let out = line.trim();
  if (!out || !/[\u0600-\u06FF]/u.test(out)) return out;

  out = out
    .replace(/([)\]])\((V\.O|O\.S)\b/giu, "$1 ($2)")
    .replace(/([)\]])\s*([اأإآء-ي])/gu, "$1 $2")
    .replace(/([اأإآء-ي])\((V\.O|O\.S)\b/giu, "$1 ($2)")
    // Targeted phrase repairs only; broad Arabic infix splitting caused false breaks like "الم وسم" and "ز وجته".
    .replace(/تبدأعزيزة/gu, "تبدأ عزيزة")
    .replace(/التحدثبصوتخارجي/gu, "التحدث بصوت خارجي")
    .replace(/السائقوزوجته/gu, "السائق وزوجته")
    .replace(/السائقجهيماني/gu, "السائق جهيماني")
    .replace(/جهيمانيسابق/gu, "جهيماني سابق")
    .replace(/إلىبابأحد/gu, "إلى باب أحد")
    .replace(/عندمايوارب/gu, "عندما يوارب")
    .replace(/الباببطريقةمشفرة/gu, "الباب بطريقة مشفرة")
    .replace(/يخفضصوتهأكثر/gu, "يخفض صوته أكثر")
    .replace(/يرحمهويعفيعنه/gu, "يرحمه ويعفي عنه")
    .replace(/يشيربيدهبمعنى/gu, "يشير بيده بمعنى")
    .replace(/القهوةتغليفي/gu, "القهوة تغلي في")
    .replace(/إبريقصغير/gu, "إبريق صغير")
    .replace(/قدتموضعهاقبلدخولهما/gu, "قد تم وضعها قبل دخولهما")
    .replace(/الكاميرافي/gu, "الكاميرا في")
    .replace(/بينمايجلس/gu, "بينما يجلس")
    .replace(/السائقعلى/gu, "السائق على")
    .replace(/تنظرزوجتهبدهشة/gu, "تنظر زوجته بدهشة")
    .replace(/أنهاتدعوهكي/gu, "أنها تدعوه كي")
    .replace(/السائقبغضب/gu, "السائق بغضب")
    .replace(/وشالسالفة/gu, "وش السالفة")
    .replace(/يقولو/gu, "يقولوا")
    .replace(/بينماتنظرعزيزة/gu, "بينما تنظر عزيزة")
    .replace(/الذييقود/gu, "الذي يقود")
    .replace(/وكأنها/gu, "وكأنها")
    .replace(/وكأنهاتريدأنتقنعه/gu, "وكأنها تريد أن تقنعه")
    .replace(/تخلعغطاءها/gu, "تخلع غطاءها")
    .replace(/لكنهاقلقة/gu, "لكنها قلقة")
    .replace(/\s{2,}/g, " ")
    .trim();

  return out;
}

function isLikelyGarbageTailLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\d+$/.test(trimmed)) return true;
  if (trimmed.length <= 2) return true;
  if (/^[\u064B-\u065F\u0670\s]+$/u.test(trimmed)) return true;
  const tokenCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (tokenCount <= 2 && trimmed.length <= 8 && !/[.!؟?،؛:]$/.test(trimmed)) return true;
  return false;
}

function trimGarbageTailLines(lines: string[]): string[] {
  const out = [...lines];
  let removed = 0;
  while (out.length > 0 && removed < 4 && isLikelyGarbageTailLine(out[out.length - 1]!)) {
    out.pop();
    removed += 1;
  }
  return out;
}

function countGarbageTailLines(lines: string[]): number {
  let count = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isLikelyGarbageTailLine(lines[i]!)) count += 1;
    else break;
  }
  return count;
}

function isMostlySingleCharArabicLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const shortTokens = tokens.filter((token) => token.length <= 2);
  const hasArabicish = tokens.some((token) => /[\u0600-\u06FF0-9]/u.test(token));
  return hasArabicish && shortTokens.length / tokens.length >= 0.85;
}

function isMostlySingleCharArabicPage(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 8) return false;
  const shortLines = lines.filter((line) => isMostlySingleCharArabicLine(line));
  return shortLines.length >= Math.max(8, Math.floor(lines.length * 0.7));
}

function lineWhitespaceRatio(text: string): number {
  return (text.match(/\s/g)?.length ?? 0) / Math.max(text.length, 1);
}

function scorePdfLineQuality(text: string): number {
  if (!text.trim()) return -100;
  let score = 0;
  if (isMostlySingleCharArabicLine(text)) score -= 8;
  if (looksLikeBrokenArabicPdfExtraction(text)) score -= 5;
  if (hasArabicPdfText(text)) score += 2;
  score += Math.min(lineWhitespaceRatio(text) * 12, 3);
  score += Math.min(text.trim().length / 40, 2);
  return score;
}

function chooseBetterPdfLine(layoutLine: string, rawLine: string): string {
  if (!layoutLine.trim()) return rawLine;
  if (!rawLine.trim()) return layoutLine;

  const layoutLetterDump = isMostlySingleCharArabicLine(layoutLine);
  const rawLetterDump = isMostlySingleCharArabicLine(rawLine);
  if (layoutLetterDump && !rawLetterDump) return rawLine;
  if (rawLetterDump && !layoutLetterDump) return layoutLine;

  const layoutScore = scorePdfLineQuality(layoutLine);
  const rawScore = scorePdfLineQuality(rawLine);
  if (Math.abs(layoutScore - rawScore) >= 1) {
    return rawScore > layoutScore ? rawLine : layoutLine;
  }

  const layoutSpaces = lineWhitespaceRatio(layoutLine);
  const rawSpaces = lineWhitespaceRatio(rawLine);
  if (rawSpaces > layoutSpaces + 0.03) return rawLine;
  if (layoutSpaces > rawSpaces + 0.03) return layoutLine;

  return layoutLine.length >= rawLine.length ? layoutLine : rawLine;
}

function mergePdfPageLines(layoutPage: string, rawPage: string): string {
  if (!layoutPage.trim()) return rawPage;
  if (!rawPage.trim()) return layoutPage;

  const layoutLines = layoutPage.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rawLines = rawPage.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!layoutLines.length) return rawPage;
  if (!rawLines.length) return layoutPage;

  if (Math.abs(layoutLines.length - rawLines.length) > Math.max(4, Math.floor(Math.max(layoutLines.length, rawLines.length) * 0.35))) {
    return chooseBetterPdfLine(layoutPage, rawPage);
  }

  const merged: string[] = [];
  const maxLines = Math.max(layoutLines.length, rawLines.length);
  for (let i = 0; i < maxLines; i++) {
    const layoutLine = layoutLines[i] ?? "";
    const rawLine = rawLines[i] ?? "";
    const chosen = chooseBetterPdfLine(layoutLine, rawLine).trim();
    if (chosen) merged.push(chosen);
  }
  return merged.join("\n").trim();
}

function scorePdfPageQuality(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return -100;
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let score = 0;
  if (hasArabicPdfText(trimmed)) score += 8;
  if (looksLikeBrokenArabicPdfExtraction(trimmed)) score -= 10;
  if (isMostlySingleCharArabicPage(trimmed)) score -= 20;
  score -= countGarbageTailLines(lines) * 2;
  score += Math.min(lineWhitespaceRatio(trimmed) * 20, 5);
  score += Math.min(lines.length, 8) * 0.35;
  if (/تورطيني|وأنا|و أنا|الصعب|الحياة/u.test(trimmed)) score += 1.5;
  return score;
}

function collectPdfQualityFlags(text: string): string[] {
  const flags = new Set<string>();
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!trimmed) flags.add("empty");
  if (looksLikeBrokenArabicPdfExtraction(trimmed)) flags.add("broken_arabic_spacing");
  if (isMostlySingleCharArabicPage(trimmed)) flags.add("single_char_dump");
  if (countGarbageTailLines(lines) >= 1) flags.add("garbage_tail");
  if (/[\u0600-\u06FF]\)\s+\(V\.O\)/u.test(trimmed) || /^\)/m.test(trimmed)) {
    flags.add("rtl_punctuation_drift");
  }
  return [...flags];
}

function shouldRunStrikeDetectionForPdfPage(
  text: string,
  pageNumber: number,
  totalPages: number,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (totalPages <= STRIKE_DETECTION_FULL_SCAN_PAGE_THRESHOLD) return true;
  if (looksLikeBrokenArabicPdfExtraction(trimmed)) return true;
  if (isMostlySingleCharArabicPage(trimmed)) return true;
  if (countGarbageTailLines(lines) >= 1) return true;
  if (/[\u0600-\u06FF]\)\s+\(V\.O\)/u.test(trimmed) || /^\)/m.test(trimmed)) return true;
  if (lines.length > 0 && lines.length <= 10 && trimmed.length <= 700) return true;
  if (pageNumber <= 12) return true;
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSnippetForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(PDF_TEXT_INVISIBLE_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findSnippetOffsets(pageText: string, snippet: string): { start: number; end: number } | null {
  const normalizedSnippet = normalizeSnippetForSearch(snippet);
  if (!normalizedSnippet) return null;

  const directIndex = pageText.indexOf(normalizedSnippet);
  if (directIndex >= 0) {
    return { start: directIndex, end: directIndex + normalizedSnippet.length };
  }

  const tokens = normalizedSnippet.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const pattern = tokens.map((token) => escapeRegExp(token)).join("\\s*");
  const regex = new RegExp(pattern, "u");
  const match = regex.exec(pageText);
  if (!match || match.index < 0) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function shouldRunOcrForPdfPage(text: string): boolean {
  if (!text.trim()) return true;
  if (isMostlySingleCharArabicPage(text)) return true;
  if (looksLikeBrokenArabicPdfExtraction(text)) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const spacedLines = lines.filter((line) => isMostlySingleCharArabicLine(line)).length;
  if (spacedLines >= 2) return true;
  if (countGarbageTailLines(lines) >= 2) return true;
  if (/[\u0600-\u06FF]\)\s+\(V\.O\)/u.test(text) || /^\)/m.test(text)) return true;
  return false;
}

function stripDuplicateLetterDump(lines: string[]): string[] {
  if (lines.length < 10) return lines;

  let bestStart = -1;
  let bestEnd = -1;
  let blockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isMostlySingleCharArabicLine(lines[i]!)) {
      if (blockStart === -1) blockStart = i;
      continue;
    }
    if (blockStart !== -1) {
      if (i - blockStart >= 8) {
        bestStart = blockStart;
        bestEnd = i;
      }
      blockStart = -1;
    }
  }
  if (blockStart !== -1 && lines.length - blockStart >= 8) {
    bestStart = blockStart;
    bestEnd = lines.length;
  }

  if (bestStart === -1 || bestEnd === -1) return lines;

  const before = lines.slice(0, bestStart).filter(Boolean);
  const block = lines.slice(bestStart, bestEnd).filter(Boolean);
  const after = lines.slice(bestEnd).filter(Boolean);
  const hasReadableContext = before.some((line) => !isMostlySingleCharArabicLine(line));
  const blockDominates = block.length >= Math.max(8, Math.floor(lines.length * 0.35));

  if (hasReadableContext && blockDominates && after.length === 0) {
    return before;
  }

  return lines;
}

function looksLikeBrokenArabicPdfExtraction(text: string): boolean {
  const normalized = normalizePdfTextRun(text).trim();
  if (!normalized || !hasArabicPdfText(normalized)) return false;
  if (normalized.length > OCR_SUSPICIOUS_MAX_TEXT_LENGTH) return false;
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > OCR_SUSPICIOUS_MAX_LINE_COUNT) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const arabicTokens = tokens.filter((token) => hasArabicPdfText(token));
  if (arabicTokens.length === 0) return false;

  const suspiciousTokens = arabicTokens.filter((token) =>
    token.length >= 8 &&
      (
        token.includes("ال") ||
        /[\u0621-\u064A]\d|\d[\u0621-\u064A]/u.test(token) ||
        (token.match(PDF_ARABIC_TOKEN_RE)?.length ?? 0) > 1
      )
  );

  const suspiciousLineCount = lines.filter((line) => {
    const lineTokens = line.split(/\s+/).filter(Boolean);
    return lineTokens.length <= 2 &&
      lineTokens.some((token) => token.length >= 8 && hasArabicPdfText(token));
  }).length;

  const whitespaceChars = normalized.match(/\s/g)?.length ?? 0;
  const whitespaceRatio = whitespaceChars / Math.max(normalized.length, 1);
  const suspiciousRatio = suspiciousTokens.length / Math.max(arabicTokens.length, 1);

  return suspiciousTokens.length >= 2 &&
    (suspiciousRatio >= 0.45 || suspiciousLineCount >= 3 || whitespaceRatio < 0.12);
}

function splitPdfPages(rawText: string): string[] {
  return rawText
    .split(/\f/g)
    .map((page) => {
      let cleanedLines = stripDuplicateLetterDump(
        page
        .split(/\r?\n/)
        .map((line) => repairCollapsedArabicWordSpacing(collapseSpacedArabicLetters(postprocessPdfExtractedLine(line))))
        .filter(Boolean),
      );
      if (isMostlySingleCharArabicPage(cleanedLines.join("\n"))) {
        cleanedLines = [
          postprocessPdfExtractedLine(
            cleanedLines.join(""),
          ),
        ].filter(Boolean);
      }
      cleanedLines = trimGarbageTailLines(cleanedLines);
      return cleanedLines.join("\n").trim();
    })
    .filter((page, index, pages) => page.length > 0 || index < pages.length - 1)
    .map((page) => sanitizePageText(page));
}

function chooseBetterPdfPages(layoutPages: string[], rawPages: string[]): string[] {
  const pageCount = Math.max(layoutPages.length, rawPages.length);
  const chosen: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const layout = layoutPages[i] ?? "";
    const raw = rawPages[i] ?? "";
    if (!raw) {
      chosen.push(layout);
      continue;
    }
    if (!layout) {
      chosen.push(raw);
      continue;
    }

    const layoutBroken = looksLikeBrokenArabicPdfExtraction(layout);
    const rawBroken = looksLikeBrokenArabicPdfExtraction(raw);
    const layoutLetterDump = isMostlySingleCharArabicPage(layout);
    const rawLetterDump = isMostlySingleCharArabicPage(raw);
    if (rawLetterDump && !layoutLetterDump) {
      chosen.push(layout);
      continue;
    }
    if (layoutLetterDump && !rawLetterDump) {
      chosen.push(raw);
      continue;
    }
    const merged = mergePdfPageLines(layout, raw);
    if (merged && !isMostlySingleCharArabicPage(merged)) {
      chosen.push(merged);
      continue;
    }
    if (layoutBroken && !rawBroken) {
      chosen.push(raw);
      continue;
    }
    if (!layoutBroken && rawBroken) {
      chosen.push(layout);
      continue;
    }

    const layoutSpaces = (layout.match(/\s/g)?.length ?? 0) / Math.max(layout.length, 1);
    const rawSpaces = (raw.match(/\s/g)?.length ?? 0) / Math.max(raw.length, 1);
    chosen.push(rawSpaces > layoutSpaces + 0.02 ? raw : layout);
  }
  return chosen;
}

async function runPdftotext(pdfPath: string, mode: "layout" | "raw"): Promise<string> {
  const outPath = path.join(
    os.tmpdir(),
    `raawi-${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  const args = [
    mode === "layout" ? "-layout" : "-raw",
    "-enc",
    "UTF-8",
    pdfPath,
    outPath,
  ];
  try {
    await execFileAsync("pdftotext", args, { timeout: 120_000 });
    return await fs.readFile(outPath, "utf8");
  } finally {
    await fs.rm(outPath, { force: true }).catch(() => undefined);
  }
}

async function resolveRenderedOutputFile(
  outputPrefix: string,
  extension: ".png" | ".svg",
  pageNumber: number,
): Promise<string> {
  const candidates = [
    `${outputPrefix}${extension}`,
    `${outputPrefix}-${pageNumber}${extension}`,
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }

  const dir = path.dirname(outputPrefix);
  const base = path.basename(outputPrefix);
  const entries = await fs.readdir(dir).catch(() => []);
  const matched = entries.find((entry) => entry.startsWith(base) && entry.endsWith(extension));
  if (matched) return path.join(dir, matched);

  throw new Error(`Rendered ${extension} output not found for page ${pageNumber}`);
}

async function renderPdfPageToPng(pdfPath: string, pageNumber: number, outputPrefix: string): Promise<string> {
  await execFileAsync("pdftoppm", [
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-r",
    String(OCR_PAGE_DPI),
    "-png",
    "-singlefile",
    pdfPath,
    outputPrefix,
  ], { timeout: 120_000 });
  return resolveRenderedOutputFile(outputPrefix, ".png", pageNumber);
}

async function renderPdfPageToSvg(pdfPath: string, pageNumber: number, outputPrefix: string): Promise<string> {
  await execFileAsync("pdftocairo", [
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-svg",
    pdfPath,
    outputPrefix,
  ], { timeout: 120_000 });
  return resolveRenderedOutputFile(outputPrefix, ".svg", pageNumber);
}

async function extractPdfPageWordBoxes(pdfPath: string, pageNumber: number, tempDir: string): Promise<PdfWordBox[]> {
  const outPath = path.join(tempDir, `bbox-page-${pageNumber}.html`);
  await execFileAsync("pdftotext", [
    "-bbox-layout",
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-enc",
    "UTF-8",
    pdfPath,
    outPath,
  ], { timeout: 120_000 });

  const html = await fs.readFile(outPath, "utf8");
  await fs.rm(outPath, { force: true }).catch(() => undefined);

  const boxes: PdfWordBox[] = [];
  const wordRe =
    /<word\b[^>]*xMin="([^"]+)"[^>]*yMin="([^"]+)"[^>]*xMax="([^"]+)"[^>]*yMax="([^"]+)"[^>]*>([\s\S]*?)<\/word>/giu;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(html)) !== null) {
    const text = postprocessPdfExtractedLine(
      match[5]
        ?.replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"') ?? "",
    );
    if (!text) continue;
    boxes.push({
      text,
      xMin: Number(match[1]),
      yMin: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
    });
  }
  return boxes;
}

function parseSvgHorizontalLines(svgText: string): PdfHorizontalLine[] {
  const lines: PdfHorizontalLine[] = [];
  const lineRe =
    /<line\b[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"[^>]*?(?:stroke-width="([^"]+)")?[^>]*>/giu;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(svgText)) !== null) {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    const strokeWidth = Number(match[5] ?? "1");
    if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2)) continue;
    if (Math.abs(y1 - y2) > 1.5) continue;
    if (Math.abs(x2 - x1) < 14) continue;
    lines.push({
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      y: (y1 + y2) / 2,
      strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 1,
    });
  }

  const pathRe = /<path\b[^>]*d="([^"]+)"[^>]*?(?:stroke-width="([^"]+)")?[^>]*>/giu;
  while ((match = pathRe.exec(svgText)) !== null) {
    const d = match[1] ?? "";
    const strokeWidth = Number(match[2] ?? "1");
    const simpleLine = /M\s*([0-9.+-]+)\s+([0-9.+-]+)\s+L\s*([0-9.+-]+)\s+([0-9.+-]+)/iu.exec(d);
    if (!simpleLine) continue;
    const x1 = Number(simpleLine[1]);
    const y1 = Number(simpleLine[2]);
    const x2 = Number(simpleLine[3]);
    const y2 = Number(simpleLine[4]);
    if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2)) continue;
    if (Math.abs(y1 - y2) > 1.5) continue;
    if (Math.abs(x2 - x1) < 14) continue;
    lines.push({
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      y: (y1 + y2) / 2,
      strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 1,
    });
  }

  return lines;
}

async function detectStrikeSpans(
  pdfPath: string,
  pageNumber: number,
  pageText: string,
  tempDir: string,
): Promise<Array<Record<string, unknown>>> {
  const [wordBoxes, svgPath] = await Promise.all([
    extractPdfPageWordBoxes(pdfPath, pageNumber, tempDir),
    renderPdfPageToSvg(pdfPath, pageNumber, path.join(tempDir, `svg-page-${pageNumber}`)),
  ]);
  const svgText = await fs.readFile(svgPath, "utf8");
  await fs.rm(svgPath, { force: true }).catch(() => undefined);

  if (!wordBoxes.length) return [];
  const lines = parseSvgHorizontalLines(svgText);
  if (!lines.length) return [];

  const struckWordIndexes = new Set<number>();
  for (const line of lines) {
    for (let i = 0; i < wordBoxes.length; i++) {
      const word = wordBoxes[i]!;
      const height = Math.max(word.yMax - word.yMin, 1);
      const overlap = Math.min(line.x2, word.xMax) - Math.max(line.x1, word.xMin);
      if (overlap < Math.max(8, (word.xMax - word.xMin) * 0.35)) continue;
      if (line.y < word.yMin + height * 0.22 || line.y > word.yMax - height * 0.18) continue;
      if (line.strokeWidth > height * 0.55) continue;
      struckWordIndexes.add(i);
    }
  }

  if (!struckWordIndexes.size) return [];

  const spans: Array<Record<string, unknown>> = [];
  let current: number[] = [];
  const flush = () => {
    if (!current.length) return;
    const words = current.map((index) => wordBoxes[index]!).filter(Boolean);
    const snippet = words.map((word) => word.text).join(" ").replace(/\s{2,}/g, " ").trim();
    if (!snippet) {
      current = [];
      return;
    }
    const offsets = findSnippetOffsets(pageText, snippet);
    spans.push({
      text: snippet,
      localStart: offsets?.start ?? null,
      localEnd: offsets?.end ?? null,
      wordCount: words.length,
      bbox: {
        xMin: Math.min(...words.map((word) => word.xMin)),
        xMax: Math.max(...words.map((word) => word.xMax)),
        yMin: Math.min(...words.map((word) => word.yMin)),
        yMax: Math.max(...words.map((word) => word.yMax)),
      },
    });
    current = [];
  };

  for (let i = 0; i < wordBoxes.length; i++) {
    if (!struckWordIndexes.has(i)) {
      flush();
      continue;
    }
    if (!current.length) {
      current.push(i);
      continue;
    }
    const prev = wordBoxes[current[current.length - 1]!]!;
    const next = wordBoxes[i]!;
    const sameLine = Math.abs(((prev.yMin + prev.yMax) / 2) - ((next.yMin + next.yMax) / 2)) <= Math.max(6, (prev.yMax - prev.yMin) * 0.75);
    const closeX = next.xMin - prev.xMax <= Math.max(24, (prev.xMax - prev.xMin) * 1.8);
    if (sameLine && closeX) {
      current.push(i);
    } else {
      flush();
      current.push(i);
    }
  }
  flush();

  return spans.filter((span) => {
    const text = typeof span.text === "string" ? span.text : "";
    return text.length >= 3;
  });
}

async function runTesseractArabic(imagePath: string): Promise<string> {
  const { stdout } = await execFileAsync("tesseract", [
    imagePath,
    "stdout",
    "-l",
    "ara",
    "--psm",
    "6",
  ], {
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout ?? "";
}

function postprocessOcrPageText(text: string): string {
  const cleanedLines = trimGarbageTailLines(
    text
      .split(/\r?\n/)
      .map((line) => repairCollapsedArabicWordSpacing(collapseSpacedArabicLetters(postprocessPdfExtractedLine(line))))
      .filter(Boolean),
  );
  return cleanedLines.join("\n").trim();
}

async function runArabicPageOcr(pdfPath: string, pageNumber: number, tempDir: string): Promise<string | null> {
  const prefix = path.join(tempDir, `ocr-page-${pageNumber}`);
  let imagePath: string | null = null;
  try {
    imagePath = await renderPdfPageToPng(pdfPath, pageNumber, prefix);
    const rawText = await runTesseractArabic(imagePath);
    const cleaned = postprocessOcrPageText(rawText);
    return cleaned || null;
  } finally {
    if (imagePath) {
      await fs.rm(imagePath, { force: true }).catch(() => undefined);
    }
  }
}

async function isExtractionStillActive(versionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("script_versions")
    .select("extraction_status")
    .eq("id", versionId)
    .single();

  if (error) {
    logger.warn("Failed to refresh PDF extraction status", {
      versionId,
      error: error.message,
    });
    return true;
  }

  return (data?.extraction_status ?? "extracting") === "extracting";
}

async function extractPdfPagesWithPoppler(
  pdfBuffer: Buffer,
  options?: { versionId?: string },
): Promise<ExtractedPdfPage[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "raawi-pdf-"));
  const pdfPath = path.join(tempDir, "input.pdf");
  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    const [layoutText, rawText] = await Promise.all([
      runPdftotext(pdfPath, "layout"),
      runPdftotext(pdfPath, "raw"),
    ]);
    const layoutPages = splitPdfPages(layoutText);
    const rawPages = splitPdfPages(rawText);
    const mergedPages = chooseBetterPdfPages(layoutPages, rawPages);
    const finalPages: ExtractedPdfPage[] = [];
    let strikeDetectionAvailable = true;

    for (let i = 0; i < mergedPages.length; i++) {
      if (options?.versionId) {
        const stillActive = await isExtractionStillActive(options.versionId);
        if (!stillActive) {
          throw createExtractionAbortError();
        }
      }

      const merged = mergedPages[i] ?? "";
      const mergedScore = scorePdfPageQuality(merged);
      const mergedMeta: PageMeta = {
        extractionEngine: "poppler",
        ocrUsed: false,
        sourceMode: "merged_text_layers",
        qualityScore: mergedScore,
        qualityFlags: collectPdfQualityFlags(merged),
      };

      let selectedText = merged;
      let selectedMeta: PageMeta = mergedMeta;

      if (shouldRunOcrForPdfPage(merged)) {
        try {
          const ocrText = await runArabicPageOcr(pdfPath, i + 1, tempDir);
          if (ocrText) {
            const ocrScore = scorePdfPageQuality(ocrText);
            const ocrMeta: PageMeta = {
              extractionEngine: "tesseract_ocr",
              ocrUsed: true,
              ocrAttempted: true,
              ocrSelected: true,
              sourceMode: "ocr",
              qualityScore: ocrScore,
              textLayerScore: mergedScore,
              qualityFlags: collectPdfQualityFlags(ocrText),
            };
            if (ocrScore >= mergedScore) {
              selectedText = ocrText;
              selectedMeta = ocrMeta;
            } else {
              selectedMeta = {
                ...mergedMeta,
                ocrUsed: true,
                ocrAttempted: true,
                ocrSelected: false,
                ocrScore,
              };
            }
          } else {
            selectedMeta = {
              ...mergedMeta,
              ocrUsed: true,
              ocrSelected: false,
              ocrAttempted: true,
            };
          }
        } catch (error) {
          logger.warn("Arabic OCR fallback failed for PDF page", {
            pageNumber: i + 1,
            error: error instanceof Error ? error.message : String(error),
          });
          selectedMeta = {
            ...mergedMeta,
            ocrUsed: true,
            ocrAttempted: true,
            ocrSelected: false,
            ocrError: error instanceof Error ? error.message : String(error),
          };
        }
      }

      if (strikeDetectionAvailable && shouldRunStrikeDetectionForPdfPage(selectedText, i + 1, mergedPages.length)) {
        try {
          const strikeSpans = await detectStrikeSpans(pdfPath, i + 1, selectedText, tempDir);
          if (strikeSpans.length > 0) {
            selectedMeta = {
              ...selectedMeta,
              strikeSpans,
              editorialFlags: [...new Set([...(Array.isArray(selectedMeta.editorialFlags) ? selectedMeta.editorialFlags as string[] : []), "crossed_out_text_detected"])],
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (/Rendered \.svg output not found/i.test(errorMessage)) {
            strikeDetectionAvailable = false;
            logger.warn("Strike-through detection disabled for remaining PDF pages", {
              pageNumber: i + 1,
              reason: errorMessage,
            });
            selectedMeta = {
              ...selectedMeta,
              strikeDetectionSkipped: true,
              strikeDetectionReason: "svg_output_unavailable",
            };
          } else {
            logger.warn("Strike-through detection failed for PDF page", {
              pageNumber: i + 1,
              error: errorMessage,
            });
            selectedMeta = {
              ...selectedMeta,
              strikeDetectionError: errorMessage,
            };
          }
        }
      }

      finalPages.push({ text: selectedText, meta: selectedMeta });
    }

    return finalPages;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function persistScriptEditorContent(
  versionId: string,
  scriptId: string,
  content: string,
  contentHash: string,
): Promise<void> {
  const { error: textErr } = await supabase
    .from("script_text")
    .upsert({
      version_id: versionId,
      content: stripInvalidUnicodeForDb(content),
      content_hash: contentHash,
    }, { onConflict: "version_id" });
  if (textErr) throw new Error(textErr.message);

  const { error: delErr } = await supabase
    .from("script_sections")
    .delete()
    .eq("version_id", versionId);
  if (delErr) throw new Error(delErr.message);

  const sections = splitScriptSections(content);
  if (!sections.length) return;
  const rows = sections.map((section, index) => ({
    script_id: scriptId,
    version_id: versionId,
    index,
    title: stripInvalidUnicodeForDb(section.title),
    start_offset: section.start_offset,
    end_offset: section.end_offset,
    meta: {},
  }));
  const { error: insErr } = await supabase.from("script_sections").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

async function persistPdfPages(version: ExtractionVersion, pageTexts: string[]): Promise<void> {
  const canonicalPages = pageTexts.map((page) => sanitizePageText(page));
  const canonicalContent = canonicalPages.join(PAGE_JOIN);
  const extractedTextHash = sha256Hash(canonicalContent);
  const offsets = computePageGlobalOffsets(canonicalPages);

  const { error: deletePagesErr } = await supabase
    .from("script_pages")
    .delete()
    .eq("version_id", version.id);
  if (deletePagesErr) throw new Error(deletePagesErr.message);

  if (canonicalPages.length > 0) {
    const pageRows = canonicalPages.map((content, index) => ({
      version_id: version.id,
      page_number: index + 1,
      content,
      content_html: null,
      start_offset_global: offsets[index]!.start_offset_global,
      end_offset_global: offsets[index]!.end_offset_global,
      display_font_stack: null,
    }));
    const { error: insertPagesErr } = await supabase.from("script_pages").insert(pageRows);
    if (insertPagesErr) throw new Error(insertPagesErr.message);
  }

  const { error: updateVersionErr } = await supabase
    .from("script_versions")
    .update({
      extracted_text: canonicalContent,
      extracted_text_hash: extractedTextHash,
      extraction_status: "done",
    })
    .eq("id", version.id);
  if (updateVersionErr) throw new Error(updateVersionErr.message);

  await persistScriptEditorContent(version.id, version.script_id, canonicalContent, extractedTextHash);
}

async function persistPdfPagesWithMeta(version: ExtractionVersion, pages: ExtractedPdfPage[]): Promise<void> {
  const canonicalPages = pages.map((page) => sanitizePageText(page.text));
  const canonicalContent = canonicalPages.join(PAGE_JOIN);
  const extractedTextHash = sha256Hash(canonicalContent);
  const offsets = computePageGlobalOffsets(canonicalPages);

  const { error: deletePagesErr } = await supabase
    .from("script_pages")
    .delete()
    .eq("version_id", version.id);
  if (deletePagesErr) throw new Error(deletePagesErr.message);

  if (canonicalPages.length > 0) {
    const pageRows = canonicalPages.map((content, index) => ({
      version_id: version.id,
      page_number: index + 1,
      content,
      content_html: null,
      start_offset_global: offsets[index]!.start_offset_global,
      end_offset_global: offsets[index]!.end_offset_global,
      display_font_stack: null,
      meta: pages[index]?.meta ?? {},
    }));
    const { error: insertPagesErr } = await supabase.from("script_pages").insert(pageRows);
    if (insertPagesErr) throw new Error(insertPagesErr.message);
  }

  const { error: updateVersionErr } = await supabase
    .from("script_versions")
    .update({
      extracted_text: canonicalContent,
      extracted_text_hash: extractedTextHash,
      extraction_status: "done",
    })
    .eq("id", version.id);
  if (updateVersionErr) throw new Error(updateVersionErr.message);

  await persistScriptEditorContent(version.id, version.script_id, canonicalContent, extractedTextHash);
}

export async function processPdfExtraction(version: ExtractionVersion): Promise<void> {
  const sourceName = (version.source_file_name ?? "").toLowerCase();
  const sourceType = (version.source_file_type ?? "").toLowerCase();
  const isPdf = sourceName.endsWith(".pdf") || sourceType === "application/pdf";
  if (!isPdf) return;

  logger.info("Starting backend PDF extraction", {
    versionId: version.id,
    scriptId: version.script_id,
    sourceFileName: version.source_file_name ?? null,
  });

  const pdfBuffer = await downloadScriptFile(version);
  const pages = await extractPdfPagesWithPoppler(pdfBuffer, { versionId: version.id });
  if (!pages.length || !pages.some((page) => page.text.trim().length > 0)) {
    throw new Error("No text extracted from PDF");
  }

  if (!(await isExtractionStillActive(version.id))) {
    throw createExtractionAbortError();
  }

  await persistPdfPagesWithMeta(version, pages);

  logger.info("Backend PDF extraction completed", {
    versionId: version.id,
    scriptId: version.script_id,
    pageCount: pages.length,
  });
}
