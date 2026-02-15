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
