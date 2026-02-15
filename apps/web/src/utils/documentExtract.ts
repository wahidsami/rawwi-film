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
  // Vite: dynamic import with ?url so the worker is copied and URL is valid
  const workerUrl = await import(
    /* @vite-ignore */ 'pdfjs-dist/build/pdf.worker.mjs?url'
  ).then((m) => (m as { default: string }).default);
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

/**
 * Extract plain text from a PDF file (browser).
 * Uses PDF.js getTextContent; no text layer (scanned PDFs) returns empty string.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  await initPdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const parts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as { str?: string }[])
      .map((item) => item.str ?? '')
      .join(' ');
    parts.push(pageText.trim());
  }
  return parts.join('\n\n').trim();
}
