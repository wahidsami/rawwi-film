/**
 * Map PDF.js text-item font names (often /BaseFont from the PDF) to a web-safe CSS font-family stack.
 * We cannot load the PDF's embedded subset in the browser without extracting font binaries (licensing + size).
 * Goal: pick a stack that approximates metrics/shaping for Arabic vs Latin scripts.
 */

/** App default when PDF gives no usable name or unknown family. */
export const DEFAULT_SCRIPT_EDITOR_FONT_STACK = "'Cairo', 'Segoe UI', 'Tahoma', sans-serif";

type FontItem = { str?: string; fontName?: string };

/** Internal glyph font ids from pdf.js (e.g. g_d0_f1) — not usable for CSS. */
function isOpaquePdfFontId(name: string): boolean {
  const t = name.trim();
  return /^g_[a-z0-9_]+$/i.test(t) || /^f_\d+$/i.test(t);
}

/**
 * Weighted by extracted string length so titles don't outweigh body.
 */
export function dominantPdfFontName(items: FontItem[]): string | null {
  const weights = new Map<string, number>();
  for (const it of items) {
    const fn = (it.fontName ?? '').trim();
    if (!fn || isOpaquePdfFontId(fn)) continue;
    const w = Math.max(1, (it.str ?? '').length);
    weights.set(fn, (weights.get(fn) ?? 0) + w);
  }
  let best: string | null = null;
  let max = 0;
  for (const [name, w] of weights) {
    if (w > max) {
      max = w;
      best = name;
    }
  }
  return best;
}

/**
 * Returns a full CSS `font-family` list, or null to mean "use DEFAULT_SCRIPT_EDITOR_FONT_STACK".
 */
export function mapPdfFontNameToCssStack(pdfFontName: string | null | undefined): string | null {
  if (!pdfFontName) return null;
  const n = pdfFontName.trim();
  if (!n || isOpaquePdfFontId(n)) return null;

  const rules: { re: RegExp; stack: string }[] = [
    {
      re: /traditional\s*arabic|arabic\s*typesetting|sakkal\s*majalla|arabic\s*transparent/i,
      stack: "'Traditional Arabic', 'Arial Unicode MS', 'Segoe UI Historic', 'Cairo', sans-serif",
    },
    {
      re: /simplified\s*arabic|arabtype|and\s+alusus|farah/i,
      stack: "'Simplified Arabic', 'Traditional Arabic', 'Segoe UI', 'Cairo', sans-serif",
    },
    {
      re: /amiri|scheherazade|noto\s*naskh|lateef|harmattan|markazi|katibeh|reem\s*kufi/i,
      stack: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Cairo', sans-serif",
    },
    {
      re: /dubai|aldhabi|baghdad|andalus|microsoft\s*uighur/i,
      stack: "'Dubai', 'Segoe UI', 'Traditional Arabic', 'Cairo', sans-serif",
    },
    {
      re: /arial.*arab|arab.*arial|tahoma|Segoe\s*ui/i,
      stack: "'Segoe UI', Tahoma, 'Arial Unicode MS', 'Cairo', sans-serif",
    },
    {
      re: /^arial(?!.*arab)|helvetica|sansserif|swiss/i,
      stack: "Arial, 'Helvetica Neue', Helvetica, ui-sans-serif, sans-serif",
    },
    {
      re: /times|nimbus\s*roman|minion|garamond|baskerville/i,
      stack: "'Times New Roman', Times, 'Noto Serif', serif",
    },
    {
      re: /courier|consolas|monaco|monospace/i,
      stack: "'Courier New', Consolas, ui-monospace, monospace",
    },
    {
      re: /cairo/i,
      stack: "'Cairo', 'Segoe UI', Tahoma, sans-serif",
    },
  ];

  for (const { re, stack } of rules) {
    if (re.test(n)) return stack;
  }

  // Arabic script in name but unmatched → generic Arabic-capable stack
  if (/arab|naskh|kufi|farsi|urdu|hebrew/i.test(n)) {
    return "'Traditional Arabic', 'Segoe UI', 'Cairo', sans-serif";
  }

  return null;
}

export function cssFontStackForPdfTextItems(items: FontItem[]): string {
  const raw = dominantPdfFontName(items);
  return mapPdfFontNameToCssStack(raw) ?? DEFAULT_SCRIPT_EDITOR_FONT_STACK;
}

/** Allow only safe font-family characters (defense if server echoes back). */
export function sanitizeFontStackForCss(input: string | null | undefined): string | null {
  if (input == null || typeof input !== 'string') return null;
  const t = input.trim().slice(0, 480);
  if (!t) return null;
  if (/[;{}<>@]/.test(t)) return null;
  return t;
}
