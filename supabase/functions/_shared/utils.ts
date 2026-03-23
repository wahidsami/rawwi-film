/**
 * Shared utilities: sanitizeFileName, correlationId, sha256, normalizeText, chunkText
 */

const SAFE_FILE_NAME = /^[a-zA-Z0-9._\-\s]+$/;
const MAX_FILE_NAME_LENGTH = 255;
const PATH_TRAVERSAL = /\.\.|\/|\\/;

export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new Error("fileName is required");
  }
  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(`fileName longer than ${MAX_FILE_NAME_LENGTH} characters`);
  }
  if (PATH_TRAVERSAL.test(fileName)) {
    throw new Error("fileName must not contain path traversal (.., /, \\)");
  }
  const trimmed = fileName.trim();
  if (!trimmed) throw new Error("fileName is empty after trim");
  if (!SAFE_FILE_NAME.test(trimmed)) {
    throw new Error("fileName contains disallowed characters");
  }
  return trimmed;
}

/**
 * Signed-upload paths: allow Arabic/Unicode names (incl. Arabic comma ،) like raawi-script-upload.
 * Strips path traversal and replaces other risky chars with underscore.
 */
export function sanitizeUnicodeUploadFileName(fileName: string): string {
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new Error("fileName is required");
  }
  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(`fileName longer than ${MAX_FILE_NAME_LENGTH} characters`);
  }
  if (PATH_TRAVERSAL.test(fileName)) {
    throw new Error("fileName must not contain path traversal (.., /, \\)");
  }
  const nfc = fileName.normalize("NFC").trim();
  if (!nfc) throw new Error("fileName is empty after trim");
  const safe = nfc.replace(/[^\p{L}\p{N}\s._\-،]/gu, "_").replace(/\s+/g, " ").trim();
  if (!safe) throw new Error("fileName is empty after sanitization");
  return safe.slice(0, MAX_FILE_NAME_LENGTH);
}

/**
 * PostgreSQL json/jsonb and some drivers reject lone UTF-16 surrogates and U+0000.
 * PDF.js / mixed scripts can yield invalid surrogate pairs; replace with U+FFFD.
 */
/**
 * Exclusive end index for slice(start, end): if end would cut between a UTF-16
 * surrogate pair, move it back so the high surrogate is not the last code unit.
 * Prevents lone surrogates in chunk substrings (Postgres: "unsupported Unicode escape sequence").
 */
export function snapUtf16ExclusiveEnd(s: string, end: number): number {
  const e = Math.min(Math.max(0, end), s.length);
  if (e === 0 || e >= s.length) return e;
  const hi = s.charCodeAt(e - 1);
  const lo = s.charCodeAt(e);
  if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) {
    return e - 1;
  }
  return e;
}

/** Inclusive start for slice(start, end): do not start on a low surrogate if preceded by high. */
export function snapUtf16InclusiveStart(s: string, start: number): number {
  const st = Math.min(Math.max(0, start), s.length);
  if (st === 0 || st >= s.length) return st;
  const c = s.charCodeAt(st);
  if (c >= 0xdc00 && c <= 0xdfff) {
    const prev = st > 0 ? s.charCodeAt(st - 1) : 0;
    if (prev >= 0xd800 && prev <= 0xdbff) return st - 1;
  }
  return st;
}

export function stripInvalidUnicodeForDb(s: string): string {
  if (typeof s !== "string" || s.length === 0) return s;
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

export function getCorrelationId(req: Request): string {
  const header = req.headers.get("x-correlation-id");
  if (header && header.trim()) return header.trim();
  return crypto.randomUUID();
}

export async function sha256Hash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize text: unicode NFC, collapse whitespace (including newlines) to single space, trim.
 */
export function normalizeText(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract plain text from HTML in DOM order (tag-stripping only).
 * Must match browser TreeWalker SHOW_TEXT output concatenation so that
 * normalize(htmlToText(html)) === normalize(domTextFromTreeWalker).
 * Used to derive script_text.content from script_text.content_html (Strategy A).
 */
export function htmlToText(html: string): string {
  if (typeof html !== "string") return "";
  let out = "";
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      i++;
      while (i < html.length && html[i] !== ">") i++;
      if (i < html.length) i++;
      continue;
    }
    out += html[i];
    i++;
  }
  return out;
}

export type Chunk = {
  text: string;
  start_offset: number;
  end_offset: number;
  start_line: number;
  end_line: number;
};

const DEFAULT_CHUNK_SIZE = 12_000;
const DEFAULT_OVERLAP = 800;

/**
 * Chunk text with overlap; compute line numbers (1-based) from normalized text.
 */
export function chunkText(
  normalized: string,
  maxChunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): Chunk[] {
  if (normalized.length === 0) return [];

  const lines = normalized.split("\n");
  const lineStarts: number[] = [0];
  let pos = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    pos += lines[i].length + 1;
    lineStarts.push(pos);
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    start = snapUtf16InclusiveStart(normalized, start);
    let end = Math.min(start + maxChunkSize, normalized.length);
    if (end < normalized.length) {
      const nextNewline = normalized.indexOf("\n", end);
      if (nextNewline !== -1 && nextNewline - start <= maxChunkSize + 500) {
        end = nextNewline + 1;
      } else {
        const lastSpace = normalized.lastIndexOf(" ", end);
        if (lastSpace > start) end = lastSpace + 1;
      }
    }
    end = snapUtf16ExclusiveEnd(normalized, end);
    if (end <= start) {
      // Boundary fell inside a supplementary char (e.g. tiny maxChunkSize); include full pair or one unit.
      if (
        start + 1 < normalized.length &&
        normalized.charCodeAt(start) >= 0xd800 &&
        normalized.charCodeAt(start) <= 0xdbff
      ) {
        end = Math.min(start + 2, normalized.length);
      } else {
        end = Math.min(start + 1, normalized.length);
      }
    }

    const text = normalized.slice(start, end);
    const startLine = lineNumberAt(lineStarts, start);
    const endLine = lineNumberAt(lineStarts, Math.max(start, end - 1));

    chunks.push({
      text,
      start_offset: start,
      end_offset: end,
      start_line: startLine,
      end_line: endLine,
    });

    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

const PAGE_JOIN = "\n\n";

/**
 * Merge consecutive script pages into chunks up to maxChunkSize (page boundaries preserved).
 * Used when ANALYSIS_CHUNK_BY_PAGE=true. Falls back to chunkText if cumulative layout mismatches normalized.
 */
export function chunkTextByScriptPages(
  normalized: string,
  pageRows: { page_number: number; content: string }[],
  maxChunkSize: number = DEFAULT_CHUNK_SIZE
): Chunk[] {
  const sorted = [...pageRows].sort((a, b) => a.page_number - b.page_number);
  if (sorted.length === 0) return chunkText(normalized, maxChunkSize, DEFAULT_OVERLAP);

  let cum = 0;
  const ranges: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const L = (r.content ?? "").length;
    ranges.push({ start: cum, end: cum + L });
    cum += L + PAGE_JOIN.length;
  }
  if (cum !== normalized.length) {
    return chunkText(normalized, maxChunkSize, DEFAULT_OVERLAP);
  }

  const lines = normalized.split("\n");
  const lineStarts: number[] = [0];
  let pos = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    pos += lines[i].length + 1;
    lineStarts.push(pos);
  }

  const chunks: Chunk[] = [];
  let i = 0;
  while (i < ranges.length) {
    const startOff = ranges[i]!.start;
    let j = i;
    let size = 0;
    while (j < ranges.length) {
      const pageLen = ranges[j]!.end - ranges[j]!.start;
      const add = pageLen + (j > i ? PAGE_JOIN.length : 0);
      if (size + add > maxChunkSize && size > 0) break;
      size += add;
      j++;
      if (size >= maxChunkSize) break;
    }
    const endOff = ranges[j - 1]!.end;
    const text = normalized.slice(startOff, endOff);
    const startLine = lineNumberAt(lineStarts, startOff);
    const endLine = lineNumberAt(lineStarts, Math.max(startOff, endOff - 1));
    chunks.push({
      text,
      start_offset: startOff,
      end_offset: endOff,
      start_line: startLine,
      end_line: endLine,
    });
    i = j;
  }
  return chunks;
}

function lineNumberAt(lineStarts: number[], offset: number): number {
  for (let i = lineStarts.length - 1; i >= 0; i--) {
    if (offset >= lineStarts[i]) return i + 1;
  }
  return 1;
}

/** Section for editor: title + start/end offsets into normalized content. */
export type EditorSection = {
  title: string;
  start_offset: number;
  end_offset: number;
};

/**
 * Heading patterns (scene/chapter, EN/AR). Match at start or after space in normalized text.
 * Order matters: longer/more specific first.
 */
const SECTION_HEADING_PATTERNS = [
  /\b(SCENE\s+\d+)\b/gi,
  /\b(Scene\s+\d+)\b/g,
  /\b(CHAPTER\s*\d*)\b/gi,
  /\b(Chapter\s*\d*)\b/g,
  /\b(الفصل\s*[٠-٩0-9]*)\b/g,
  /\b(مشهد\s*[٠-٩0-9]+)\b/g,
  /\b(المشهد\s*[٠-٩0-9]+)\b/g,
];

/**
 * Basic section splitter for script editor.
 * Detects headings like "Scene 1", "SCENE 1", "مشهد ١", "المشهد 1", "Chapter", "الفصل".
 * If no headings, returns one section "Full Script" covering the entire range.
 */
export function splitScriptSections(normalizedContent: string): EditorSection[] {
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

  const sections: EditorSection[] = [];
  if (deduped[0].offset > 0) {
    sections.push({
      title: "Intro",
      start_offset: 0,
      end_offset: deduped[0].offset,
    });
  }
  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].offset;
    const end = i + 1 < deduped.length ? deduped[i + 1].offset : len;
    sections.push({
      title: deduped[i].title,
      start_offset: start,
      end_offset: end,
    });
  }
  return sections;
}
