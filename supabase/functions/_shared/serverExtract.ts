/**
 * Authoritative script extraction on Edge (Deno).
 * Output pages must match what we store in script_pages.content and join for script_text.content.
 *
 * PDF.js on Supabase Edge: no real Web Workers → PDF.js uses a "fake worker" that would normally
 * `import(workerSrc)` for pdf.worker.mjs. Remote dynamic imports fail on Edge ("Module not found").
 * mozilla/pdf.js supports pre-registering the handler: `globalThis.pdfjsWorker = { WorkerMessageHandler }`
 * so the fake worker uses statically imported worker code (no runtime URL import).
 */
import { getDocument } from "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.mjs";
import { WorkerMessageHandler } from "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.mjs";

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler };
};
const _pdfG = globalThis as PdfJsWorkerGlobal;
if (!_pdfG.pdfjsWorker) {
  _pdfG.pdfjsWorker = { WorkerMessageHandler };
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PAGE_SEP = "\n\n";
const CHARS_PER_VIRTUAL_PAGE = 1200;
const MAX_DOCX_HEURISTIC_PAGE_CHARS = 2600;
const TARGET_PRINT_LIKE_DOCX_CHUNK = 1680;

const SCENE_SPLIT_RE =
  /(?=^(?:[^\S\r\n]*)(?:المشهد\s*[\d\u0660-\u0669]+|INT\.|EXT\.|I\/E\.|INT\/EXT|\.INT|\.EXT)\b)/gim;

export function sanitizePageText(raw: string): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trimEnd();
}

type TextItem = { str?: string; transform?: number[]; fontName?: string; hasEOL?: boolean };

function pageItemsToText(items: TextItem[]): string {
  if (!items.length) return "";
  const hasTransform = items.some((it) => Array.isArray(it.transform) && it.transform.length >= 6);
  if (!hasTransform) {
    return items.map((it) => it.str ?? "").join(" ").trim();
  }
  const lines: string[] = [];
  let lastY: number | null = null;
  const lineBuf: { str: string; x: number }[] = [];
  const flushLine = () => {
    if (!lineBuf.length) return;
    lineBuf.sort((a, b) => b.x - a.x);
    lines.push(lineBuf.map((p) => p.str).join(" ").trim());
    lineBuf.length = 0;
  };
  for (const it of items) {
    const str = it.str ?? "";
    const tr = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform : null;
    const y = tr ? tr[5]! : null;
    const x = tr ? tr[4]! : 0;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      flushLine();
    }
    lastY = y;
    if (str) lineBuf.push({ str, x });
  }
  flushLine();
  return lines.join("\n").trim();
}

const PDFJS_VER = "4.4.168";
const PDFJS_ORIGIN = `https://unpkg.com/pdfjs-dist@${PDFJS_VER}`;

export async function extractPdfPageTexts(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const data = new Uint8Array(arrayBuffer);
  const loadingTask = getDocument({
    data,
    cMapUrl: `${PDFJS_ORIGIN}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ORIGIN}/standard_fonts/`,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = pageItemsToText((content.items || []) as TextItem[]);
    pages.push(sanitizePageText(text) || "");
  }
  return pages;
}

function walkDocxBodyForPageBreaks(body: Element): string[] | null {
  const pageTexts: string[] = [];
  let current: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      current.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const local = el.localName;
    const ns = el.namespaceURI;
    if (ns === W_NS) {
      if (local === "t") {
        current.push(el.textContent ?? "");
        return;
      }
      if (local === "br") {
        const type = el.getAttributeNS(W_NS, "type") ?? el.getAttribute("type");
        if (type === "page") {
          pageTexts.push(current.join("").trim());
          current = [];
        }
        return;
      }
      if (local === "lastRenderedPageBreak") {
        pageTexts.push(current.join("").trim());
        current = [];
        return;
      }
      if (local === "p") {
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!);
        current.push("\n");
        return;
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!);
  }

  walk(body);
  const last = current.join("").trim();
  if (last) pageTexts.push(last);
  if (pageTexts.length <= 1) return null;
  return pageTexts;
}

function extractDocxFullPlain(body: Element): string {
  const parts: string[] = [];
  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.namespaceURI === W_NS) {
      if (el.localName === "t") {
        parts.push(el.textContent ?? "");
        return;
      }
      if (el.localName === "tab") {
        parts.push("\t");
        return;
      }
      if (el.localName === "br") {
        const type = el.getAttributeNS(W_NS, "type") ?? el.getAttribute("type");
        parts.push(type === "page" ? "\n" : "\n");
        return;
      }
      if (el.localName === "lastRenderedPageBreak") {
        parts.push("\n");
        return;
      }
      if (el.localName === "p") {
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!);
        parts.push("\n");
        return;
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!);
  }
  walk(body);
  return sanitizePageText(parts.join(""));
}

function slicePlainIntoChunks(plain: string, maxLen: number): string[] {
  if (plain.length <= maxLen) return [plain];
  const slices: string[] = [];
  let i = 0;
  while (i < plain.length) {
    let j = Math.min(i + maxLen, plain.length);
    if (j < plain.length) {
      const pb = plain.lastIndexOf("\n\n", j);
      if (pb >= i + Math.floor(maxLen * 0.32)) j = pb + 2;
      else {
        const nl = plain.lastIndexOf("\n", j);
        if (nl >= i + Math.floor(maxLen * 0.38)) j = nl + 1;
      }
    }
    slices.push(plain.slice(i, j));
    i = j;
  }
  return slices;
}

function subdivideLongPages(pages: string[]): string[] {
  const out: string[] = [];
  for (const t of pages) {
    if (t.length <= MAX_DOCX_HEURISTIC_PAGE_CHARS) {
      out.push(t);
      continue;
    }
    out.push(...slicePlainIntoChunks(t, TARGET_PRINT_LIKE_DOCX_CHUNK));
  }
  return out;
}

function splitBySceneHeadings(plain: string): string[] {
  const raw = plain.split(SCENE_SPLIT_RE);
  const parts = raw.map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length < 2 || parts.some((p) => p.length < 8)) return [];
  return parts;
}

function virtualPages(plain: string): string[] {
  if (plain.length <= CHARS_PER_VIRTUAL_PAGE) return [plain];
  const numPages = Math.max(1, Math.ceil(plain.length / CHARS_PER_VIRTUAL_PAGE));
  const chunkSize = Math.ceil(plain.length / numPages);
  const textParts: string[] = [];
  for (let i = 0; i < numPages; i++) {
    const start = i * chunkSize;
    const end = i === numPages - 1 ? plain.length : start + chunkSize;
    textParts.push(plain.slice(start, end));
  }
  return textParts;
}

/**
 * Returns per-page plain text (canonical segments). No HTML.
 */
export async function extractDocxPageTexts(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("Invalid DOCX: missing word/document.xml");

  const parser = new DOMParser();
  const xdoc = parser.parseFromString(docXml, "application/xml");
  const body = xdoc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("Invalid DOCX: no body");

  const byBreaks = walkDocxBodyForPageBreaks(body);
  let pages: string[];

  if (byBreaks != null && byBreaks.length > 1) {
    pages = byBreaks.map((p) => sanitizePageText(p)).filter((p) => p.length > 0);
    if (pages.length === 0) pages = [sanitizePageText(extractDocxFullPlain(body))];
  } else {
    const full = extractDocxFullPlain(body);
    if (!full.trim()) return [];
    const scene = splitBySceneHeadings(full);
    pages = scene.length > 1 ? scene : virtualPages(full);
  }

  pages = subdivideLongPages(pages);
  return pages.map(sanitizePageText).filter((p) => p.length > 0);
}

export function joinPagesCanonical(pageTexts: string[]): string {
  return pageTexts.map(sanitizePageText).join(PAGE_SEP);
}

export function computePageGlobalOffsets(
  pageTexts: string[]
): Array<{ start_offset_global: number; end_offset_global: number }> {
  const offsets: Array<{ start_offset_global: number; end_offset_global: number }> = [];
  let cursor = 0;
  const sepLen = PAGE_SEP.length;
  for (let i = 0; i < pageTexts.length; i++) {
    const content = sanitizePageText(pageTexts[i]!);
    const start = cursor;
    const end = start + content.length;
    offsets.push({ start_offset_global: start, end_offset_global: end });
    cursor = end + (i < pageTexts.length - 1 ? sepLen : 0);
  }
  return offsets;
}
