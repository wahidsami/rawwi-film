/**
 * Single place to configure pdfjs-dist worker (documentExtract, PdfOriginalViewer, etc.).
 * Worker is bundled via Vite (?url) — same-origin, matches installed pdfjs-dist, CSP-safe.
 */
import * as pdfjsLib from 'pdfjs-dist';

let initialized = false;

export async function ensurePdfjsWorker(): Promise<void> {
  if (initialized) return;
  const workerUrl = await import(/* @vite-ignore */ 'pdfjs-dist/build/pdf.worker.mjs?url').then(
    (m) => (m as { default: string }).default,
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  initialized = true;
}
