/**
 * Client-side text extraction for DOCX and PDF.
 * Used so we never hit the 501 branch on the extract endpoint.
 */

// CJS package: namespace import for Vite compatibility
import * as mammothModule from 'mammoth';
const mammoth = (mammothModule as { default?: typeof mammothModule }).default ?? mammothModule;

import * as pdfjsLib from 'pdfjs-dist';

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
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return (result.value ?? '').trim();
}

/**
 * Extract both plain text and HTML from DOCX (single read of file).
 */
export async function extractDocx(file: File): Promise<{ plain: string; html: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const [plainResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }),
  ]);
  return {
    plain: (plainResult.value ?? '').trim(),
    html: (htmlResult.value ?? '').trim(),
  };
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
 * Split DOCX into pages for page-based storage and viewer.
 * Uses form-feed in plain text when present; otherwise virtual pages by size.
 * Splits HTML at safe tag boundaries so each page has both text and html.
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

type TextItem = { str?: string; transform?: number[] };

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
  let lineParts: string[] = [];
  for (const it of items as TextItem[]) {
    const str = it.str ?? "";
    const y = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      if (lineParts.length) {
        lines.push(lineParts.join(" ").trim());
        lineParts = [];
      }
    }
    lastY = y;
    if (str) lineParts.push(str);
  }
  if (lineParts.length) lines.push(lineParts.join(" ").trim());
  return lines.join("\n").trim();
}

/**
 * Extract text per page from a PDF file (browser).
 * Uses PDF.js getTextContent; preserves line structure when item positions are available.
 * Use this when sending pages to the backend for page-based storage.
 */
export async function extractTextFromPdfPerPage(file: File): Promise<Array<{ pageNumber: number; text: string }>> {
  await initPdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const pages: Array<{ pageNumber: number; text: string }> = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = pageItemsToText((content.items || []) as TextItem[]);
    pages.push({ pageNumber: i, text: pageText });
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
