/**
 * Client-side text extraction for DOCX and PDF.
 * Used so we never hit the 501 branch on the extract endpoint.
 * DOCX: when the file contains Word page breaks, workspace pages match the original document exactly.
 */

// CJS package: namespace import for Vite compatibility
import * as mammothModule from 'mammoth';
const mammoth = (mammothModule as { default?: typeof mammothModule }).default ?? mammothModule;

import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { DOCX_SCRIPT_STYLE_MAP } from './mammothDocxStyles';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function mammothHtmlOptions(arrayBuffer: ArrayBuffer) {
  return { arrayBuffer, styleMap: DOCX_SCRIPT_STYLE_MAP };
}

let pdfWorkerInitialized = false;

async function initPdfWorker() {
  if (pdfWorkerInitialized) return;
  let workerUrl: string;
  if (import.meta.env.DEV) {
    // Dev: use dynamic import so Vite serves the worker from node_modules.
    workerUrl = await import(/* @vite-ignore */ 'pdfjs-dist/build/pdf.worker.mjs?url').then(
      (m) => (m as { default: string }).default
    );
  } else {
    // Production: use CDN so we never depend on your server (no Nginx, no MIME config).
    // Same version as the installed pdfjs-dist; CDN serves correct MIME type for .mjs.
    const version = (pdfjsLib as { version?: string }).version || "4.7.76";
    workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfWorkerInitialized = true;
}

/**
 * Extract plain text from a DOCX file (browser).
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value ?? '').trim();
}

/**
 * Extract HTML from a DOCX file (browser). Use for formatted view; plain text remains canonical for analysis.
 */
export async function extractHtmlFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(mammothHtmlOptions(arrayBuffer));
  return (result.value ?? '').trim();
}

/**
 * Extract both plain text and HTML from DOCX (single read of file).
 */
export async function extractDocx(file: File): Promise<{ plain: string; html: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const [plainResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml(mammothHtmlOptions(arrayBuffer)),
  ]);
  return {
    plain: (plainResult.value ?? '').trim(),
    html: (htmlResult.value ?? '').trim(),
  };
}

/**
 * Extract text per page from DOCX using OOXML (Word page breaks).
 * Returns array of text strings, one per page, or null if parsing fails or no page breaks found.
 * When non-null and length > 1, workspace pages will match the original document exactly.
 */
export async function getDocxPageTextsFromOoxml(arrayBuffer: ArrayBuffer): Promise<string[] | null> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'application/xml');
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
    if (!body) return null;

    const pageTexts: string[] = [];
    let current: string[] = [];

    function walk(node: Node): void {
      if (node.nodeType === Node.TEXT_NODE) {
        current.push(node.textContent ?? '');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      const local = el.localName;
      const ns = el.namespaceURI;
      if (ns === W_NS) {
        if (local === 't') {
          current.push(el.textContent ?? '');
          return;
        }
        if (local === 'br') {
          const type = el.getAttributeNS(W_NS, 'type') ?? el.getAttribute('type');
          if (type === 'page') {
            pageTexts.push(current.join('').trim());
            current = [];
          }
          return;
        }
        if (local === 'lastRenderedPageBreak') {
          pageTexts.push(current.join('').trim());
          current = [];
          return;
        }
        if (local === 'p') {
          for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!);
          current.push('\n');
          return;
        }
      }
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!);
    }

    walk(body);
    const last = current.join('').trim();
    if (last) pageTexts.push(last);

    if (pageTexts.length <= 1) return null;
    return pageTexts;
  } catch {
    return null;
  }
}

/** Approximate chars per "page" when splitting DOCX with no explicit page breaks (lower = more pages). */
const CHARS_PER_VIRTUAL_PAGE = 1200;

/** Find safe split positions in HTML (after closing tags) near target indices */
function findSafeSplitPositions(html: string, numSplits: number): number[] {
  if (numSplits <= 0) return [];
  const len = html.length;
  const positions: number[] = [];
  const safeEnd = /<\/(?:p|div|section|article|h[1-6])>\s*/gi;
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = safeEnd.exec(html)) !== null) {
    indices.push(m.index + m[0].length);
  }
  for (let i = 1; i <= numSplits; i++) {
    const target = (len * i) / (numSplits + 1);
    let best = len;
    let bestDist = Infinity;
    for (const pos of indices) {
      if (pos >= target && pos < len - 10) {
        const d = Math.abs(pos - target);
        if (d < bestDist) {
          bestDist = d;
          best = pos;
        }
      }
    }
    if (best < len) positions.push(best);
  }
  return positions.sort((a, b) => a - b).filter((p, i, arr) => i === 0 || p > arr[i - 1] + 50);
}

/**
 * Find HTML indices where cumulative visible text length reaches the given targets.
 * Counts only text outside tags so we can split HTML to match exact page content.
 */
function findHtmlIndicesByTextLength(html: string, textLengthTargets: number[]): number[] {
  const positions: number[] = [];
  let textCount = 0;
  let targetIdx = 0;
  let i = 0;
  while (i < html.length && targetIdx < textLengthTargets.length) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      i = close === -1 ? html.length : close + 1;
      continue;
    }
    if (html[i] === '&') {
      const semi = html.indexOf(';', i);
      if (semi !== -1) {
        textCount += 1;
        i = semi + 1;
      } else {
        textCount += 1;
        i += 1;
      }
      if (textCount >= textLengthTargets[targetIdx]!) {
        positions.push(i);
        targetIdx += 1;
      }
      continue;
    }
    textCount += 1;
    i += 1;
    if (textCount >= textLengthTargets[targetIdx]!) {
      positions.push(i);
      targetIdx += 1;
    }
  }
  return positions;
}

function firstNonEmptyLine(s: string): string {
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return '';
}

/**
 * Stronger boundary: first line + start of second line (reduces false indexOf inside same page).
 */
function pageStartSearchNeedle(nextPageText: string): string {
  const lines = nextPageText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return `${lines[0]}\n${lines[1]!.slice(0, Math.min(40, lines[1].length))}`;
  return lines[0] ?? nextPageText.slice(0, 80).trim();
}

/** Visible text from HTML in document order; off[i] = HTML index of i-th visible char. */
function visiblePlainFromHtml(html: string): { s: string; off: number[] } {
  const off: number[] = [];
  let s = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      i = close === -1 ? html.length : close + 1;
      continue;
    }
    if (html[i] === '&') {
      const semi = html.indexOf(';', i);
      const entity = semi !== -1 ? html.slice(i, semi + 1) : '';
      let ch = '\u00a0';
      if (entity === '&nbsp;' || entity === '&#160;') ch = ' ';
      else if (entity === '&amp;') ch = '&';
      else if (entity === '&lt;') ch = '<';
      else if (entity === '&gt;') ch = '>';
      else if (entity === '&quot;') ch = '"';
      else if (semi !== -1 && /^&#\d+;$/.test(entity)) ch = String.fromCharCode(parseInt(entity.slice(2, -1), 10));
      else if (semi !== -1) ch = ' ';
      off.push(i);
      s += ch;
      i = semi !== -1 ? semi + 1 : i + 1;
      continue;
    }
    off.push(i);
    s += html[i]!;
    i += 1;
  }
  return { s, off };
}

/**
 * Split HTML using first line of each page (OOXML) as anchor in mammoth's visible HTML text.
 * Workspace page text stays OOXML-accurate (first/last lines match Word); HTML matches that region.
 */
function splitHtmlByVisibleLineAnchors(html: string, pageTexts: string[]): string[] {
  const { s, off } = visiblePlainFromHtml(html);
  if (!s.length || !off.length) return pageTexts.map((t) => escapeHtmlMinimal(t));
  const n = pageTexts.length;
  const parts: string[] = [];
  let charCursor = 0;

  for (let i = 0; i < n; i++) {
    const fl = firstNonEmptyLine(pageTexts[i]!);
    let startChar = i === 0 ? 0 : charCursor;
    if (fl) {
      let ix = s.indexOf(fl, Math.max(0, startChar - 100));
      if (ix < 0) ix = s.indexOf(fl.replace(/\s+/g, ' ').trim(), Math.max(0, startChar - 100));
      if (ix >= 0 && (i === 0 || ix <= startChar + 600)) startChar = ix;
    }

    let endChar: number;
    if (i < n - 1) {
      const needle = pageStartSearchNeedle(pageTexts[i + 1]!);
      const nfl = firstNonEmptyLine(pageTexts[i + 1]!);
      const searchFrom = startChar + Math.max(3, Math.min(400, (pageTexts[i]!.length >> 2) | 0));
      endChar = needle.length >= 6 ? s.indexOf(needle, searchFrom) : -1;
      if (endChar < 0 && nfl) endChar = s.indexOf(nfl, searchFrom);
      if (endChar < 0 && nfl) endChar = s.indexOf(nfl, startChar + 1);
      if (endChar < 0 || endChar <= startChar) {
        endChar = Math.min(s.length, startChar + Math.max(pageTexts[i]!.length, 80));
      }
    } else {
      endChar = s.length;
    }

    const h0 =
      startChar >= off.length ? html.length : (off[startChar] ?? 0);
    const h1 = endChar < off.length ? off[endChar]! : html.length;
    let slice = html.slice(h0, h1).trim();
    const safe = /<\/(?:p|div|section|article|h[1-6])>\s*/gi;
    let extended = h1;
    let m: RegExpExecArray | null;
    while ((m = safe.exec(html)) !== null) {
      const pos = m.index + m[0].length;
      if (pos > h1 && pos < h1 + 1200) {
        extended = pos;
        break;
      }
    }
    if (extended > h1) slice = html.slice(h0, extended).trim();

    parts.push(slice);
    charCursor = endChar;
  }
  return parts;
}

function escapeHtmlMinimal(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => `<p dir="rtl">${line || '\u00a0'}</p>`)
    .join('');
}

/**
 * Split HTML at boundaries that match page text lengths, so each segment's content matches one page.
 * Uses safe tag boundaries (e.g. after </p>) so we don't cut inside a tag.
 */
function splitHtmlByContentBoundaries(html: string, pageTexts: string[]): string[] {
  if (pageTexts.length === 0) return [];
  if (pageTexts.length === 1) return [html.trim()];
  const safeEnd = /<\/(?:p|div|section|article|h[1-6])>\s*/gi;
  const safeIndices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = safeEnd.exec(html)) !== null) safeIndices.push(m.index + m[0].length);
  let cum = 0;
  const targets: number[] = [];
  for (let i = 0; i < pageTexts.length - 1; i++) {
    cum += pageTexts[i]!.length;
    targets.push(cum);
  }
  const rawPositions = findHtmlIndicesByTextLength(html, targets);
  const splitPositions = rawPositions.map((pos) => {
    const best = safeIndices.reduce((best, s) =>
      s >= pos - 200 && s <= pos + 500 && (best === -1 || Math.abs(s - pos) < Math.abs(best - pos)) ? s : best
    , -1);
    return best >= 0 ? best : Math.min(pos, html.length);
  });
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    const end = i < splitPositions.length ? splitPositions[i]! : html.length;
    parts.push(html.slice(start, end).trim());
    start = end;
  }
  return parts;
}

/**
 * Split full HTML into segments proportionally to text lengths (fallback when content-based split fails).
 */
function splitHtmlByTextLengths(html: string, textLengths: number[]): string[] {
  if (textLengths.length === 0) return [];
  const total = textLengths.reduce((a, b) => a + b, 0);
  if (total === 0) return textLengths.map(() => '');
  const safeEnd = /<\/(?:p|div|section|article|h[1-6])>\s*/gi;
  const indices: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = safeEnd.exec(html)) !== null) indices.push(mm.index + mm[0].length);
  let cum = 0;
  const splitTargets: number[] = [];
  for (let i = 0; i < textLengths.length - 1; i++) {
    cum += textLengths[i]!;
    splitTargets.push(Math.round((html.length * cum) / total));
  }
  const splitPositions = splitTargets.map((target) => {
    const closest = indices.reduce((best, pos) =>
      Math.abs(pos - target) < Math.abs(best - target) ? pos : best
    , target);
    return closest;
  });
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < textLengths.length; i++) {
    const end = i < splitPositions.length ? splitPositions[i]! : html.length;
    parts.push(html.slice(start, end).trim());
    start = end;
  }
  return parts;
}

/**
 * Extract DOCX and return pages. When the document contains Word page breaks, pages match the original.
 * Otherwise falls back to form-feed or virtual page split.
 */
export async function extractDocxWithPages(file: File): Promise<{
  plain: string;
  html: string;
  pages: Array<{ pageNumber: number; text: string; html: string }>;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const [plainResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml(mammothHtmlOptions(arrayBuffer)),
  ]);
  const plain = (plainResult.value ?? '').trim();
  const html = (htmlResult.value ?? '').trim();

  const realPageTexts = await getDocxPageTextsFromOoxml(arrayBuffer);
  if (realPageTexts != null && realPageTexts.length > 1) {
    let htmlParts = splitHtmlByVisibleLineAnchors(html, realPageTexts);
    const anchorWeak =
      htmlParts.filter((p) => p.length > 15).length < Math.ceil(realPageTexts.length / 2);
    if (anchorWeak) {
      htmlParts = splitHtmlByContentBoundaries(html, realPageTexts);
      const contentBasedOk =
        htmlParts.length === realPageTexts.length &&
        htmlParts.every((p, j) => p.length > 0 || (realPageTexts[j]?.length ?? 0) === 0);
      if (!contentBasedOk) htmlParts = splitHtmlByTextLengths(html, realPageTexts.map((t) => t.length));
    }

    const pages = realPageTexts.map((text, i) => ({
      pageNumber: i + 1,
      /** OOXML: first/last non-empty lines match the original Word page. */
      text,
      html: (htmlParts[i] ?? '').trim() || escapeHtmlMinimal(text),
    }));
    return { plain, html, pages };
  }

  const scenePages = trySplitDocxPagesBySceneHeadings(plain, html);
  if (scenePages.length > 1) {
    return { plain, html, pages: scenePages };
  }
  const pages = splitDocxIntoPages(html, plain);
  return { plain, html, pages };
}

/**
 * When Word has no page breaks, split on scene headings (Arabic المشهد / English INT./EXT.)
 * so workspace "pages" align with story beats instead of arbitrary char chunks.
 */
export function trySplitDocxPagesBySceneHeadings(
  plain: string,
  html: string
): Array<{ pageNumber: number; text: string; html: string }> {
  const re =
    /(?=^(?:[^\S\r\n]*)(?:المشهد\s*[\d\u0660-\u0669]+|INT\.|EXT\.|I\/E\.|INT\/EXT|\.INT|\.EXT)\b)/gim;
  const raw = plain.split(re);
  const parts = raw.map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length < 2) return [];
  if (parts.some((p) => p.length < 8)) return [];

  const targets: number[] = [];
  let acc = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += parts[i]!.length;
    targets.push(acc);
  }
  const indices = findHtmlIndicesByTextLength(html.trim(), targets);
  if (indices.length < targets.length) return [];

  const trimmedHtml = html.trim();
  const htmlParts: string[] = [];
  let start = 0;
  for (let i = 0; i < indices.length; i++) {
    htmlParts.push(trimmedHtml.slice(start, indices[i]!).trim());
    start = indices[i]!;
  }
  htmlParts.push(trimmedHtml.slice(start).trim());

  return parts.map((text, i) => ({
    pageNumber: i + 1,
    text,
    html: (htmlParts[i] ?? '').trim() || escapeHtmlMinimal(text),
  }));
}

/**
 * Split DOCX into pages for page-based storage and viewer.
 * Uses form-feed in plain text when present; otherwise virtual pages by size.
 * Splits HTML at safe tag boundaries so each page has both text and html.
 * For real Word page breaks, use extractDocxWithPages() instead.
 */
export function splitDocxIntoPages(html: string, plain: string): Array<{ pageNumber: number; text: string; html: string }> {
  const trimmedHtml = html.trim();
  const trimmedPlain = plain.trim();
  if (!trimmedHtml && !trimmedPlain) return [{ pageNumber: 1, text: '', html: '' }];

  // Split plain by form-feed (Word page break) or by virtual page size
  let textParts: string[];
  if (/\f/.test(trimmedPlain)) {
    textParts = trimmedPlain.split(/\f+/).map((s) => s.trim()).filter(Boolean);
    if (textParts.length === 0) textParts = [trimmedPlain];
  } else if (trimmedPlain.length > CHARS_PER_VIRTUAL_PAGE) {
    const numPages = Math.max(1, Math.ceil(trimmedPlain.length / CHARS_PER_VIRTUAL_PAGE));
    const chunkSize = Math.ceil(trimmedPlain.length / numPages);
    textParts = [];
    for (let i = 0; i < numPages; i++) {
      const start = i * chunkSize;
      const end = i === numPages - 1 ? trimmedPlain.length : start + chunkSize;
      textParts.push(trimmedPlain.slice(start, end));
    }
  } else {
    return [{ pageNumber: 1, text: trimmedPlain, html: trimmedHtml }];
  }

  if (textParts.length === 1) {
    return [{ pageNumber: 1, text: textParts[0] ?? trimmedPlain, html: trimmedHtml }];
  }

  // Split HTML at safe boundaries to match number of text parts
  let splitPositions = findSafeSplitPositions(trimmedHtml, textParts.length - 1);
  while (splitPositions.length < textParts.length - 1) {
    splitPositions = [...splitPositions, trimmedHtml.length];
  }
  splitPositions = splitPositions.slice(0, textParts.length - 1).sort((a, b) => a - b);
  const htmlParts: string[] = [];
  let start = 0;
  for (let i = 0; i < textParts.length; i++) {
    const end = i < splitPositions.length ? splitPositions[i]! : trimmedHtml.length;
    htmlParts.push(trimmedHtml.slice(start, end).trim());
    start = end;
  }
  if (start < trimmedHtml.length && htmlParts.length > 0) {
    htmlParts[htmlParts.length - 1] += trimmedHtml.slice(start);
  }

  return textParts.map((text, i) => ({
    pageNumber: i + 1,
    text: text,
    html: htmlParts[i] ?? '',
  }));
}

const PAGE_SEPARATOR = '\n\n';

type TextItem = { str?: string; transform?: number[]; fontName?: string; hasEOL?: boolean };

function escapeHtmlForPdf(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isBoldPdfFont(name?: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return /bold|black|heavy|semibold|demibold|demi/i.test(name);
}

/**
 * Build minimal HTML per PDF page: one <p class="pdf-line"> per line; <strong> when font name suggests bold.
 */
function pageItemsToHtml(items: TextItem[]): string {
  if (!items.length) return '';
  const hasTransform = items.some((it) => Array.isArray(it.transform) && it.transform.length >= 6);
  if (!hasTransform) {
    const t = items.map((it) => it.str ?? '').join(' ').trim();
    return t ? `<div class="pdf-page-body script-import-body"><p class="pdf-line">${escapeHtmlForPdf(t)}</p></div>` : '';
  }
  type LinePart = { str: string; bold: boolean; x: number };
  const lines: LinePart[][] = [];
  let lastY: number | null = null;
  let lineParts: LinePart[] = [];
  for (const it of items) {
    const str = it.str ?? '';
    const tr = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform : null;
    const y = tr ? tr[5]! : null;
    const x = tr ? tr[4]! : 0;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      if (lineParts.length) {
        lineParts.sort((a, b) => b.x - a.x);
        lines.push(lineParts);
      }
      lineParts = [];
    }
    lastY = y;
    if (str) lineParts.push({ str, bold: isBoldPdfFont(it.fontName), x });
  }
  if (lineParts.length) {
    lineParts.sort((a, b) => b.x - a.x);
    lines.push(lineParts);
  }
  const paras = lines.map((parts) => {
    const inner = parts
      .map((p) => {
        const e = escapeHtmlForPdf(p.str);
        return p.bold ? `<strong>${e}</strong>` : e;
      })
      .join(' ');
    return `<p class="pdf-line">${inner}</p>`;
  });
  return `<div class="pdf-page-body script-import-body">${paras.join('')}</div>`;
}

/**
 * Build page text from getTextContent items, preserving line breaks when transform (y position) is available.
 */
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
  for (const it of items as TextItem[]) {
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

/**
 * Extract text per page from a PDF file (browser).
 * Uses PDF.js getTextContent; preserves line structure when item positions are available.
 * Use this when sending pages to the backend for page-based storage.
 */
export async function extractTextFromPdfPerPage(
  file: File
): Promise<Array<{ pageNumber: number; text: string; html: string }>> {
  await initPdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const pages: Array<{ pageNumber: number; text: string; html: string }> = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const raw = (content.items || []) as TextItem[];
    const pageText = pageItemsToText(raw);
    const pageHtml = pageItemsToHtml(raw);
    pages.push({ pageNumber: i, text: pageText, html: pageHtml });
  }
  return pages;
}

/**
 * Extract plain text from a PDF file (browser) as a single string.
 * Joins per-page text with PAGE_SEPARATOR. For page-based import use extractTextFromPdfPerPage instead.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const pages = await extractTextFromPdfPerPage(file);
  return pages.map((p) => p.text).join(PAGE_SEPARATOR).trim();
}
