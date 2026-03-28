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

type ExtractionVersion = {
  id: string;
  script_id: string;
  source_file_name: string | null;
  source_file_type: string | null;
  source_file_path: string | null;
};

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
        .map((line) => collapseSpacedArabicLetters(postprocessPdfExtractedLine(line)))
        .filter(Boolean),
      );
      if (isMostlySingleCharArabicPage(cleanedLines.join("\n"))) {
        cleanedLines = [
          postprocessPdfExtractedLine(
            cleanedLines.join(""),
          ),
        ].filter(Boolean);
      }
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

async function extractPdfPagesWithPoppler(pdfBuffer: Buffer): Promise<string[]> {
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
    return chooseBetterPdfPages(layoutPages, rawPages);
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
  const pageTexts = await extractPdfPagesWithPoppler(pdfBuffer);
  if (!pageTexts.length || !pageTexts.some((page) => page.trim().length > 0)) {
    throw new Error("No text extracted from PDF");
  }

  await persistPdfPages(version, pageTexts);

  logger.info("Backend PDF extraction completed", {
    versionId: version.id,
    scriptId: version.script_id,
    pageCount: pageTexts.length,
  });
}
