/**
 * Canonical text normalization and HTML-to-text for offset alignment.
 * MUST match backend exactly: supabase/functions/_shared/utils.ts
 * (normalizeText, htmlToText). See docs/NORMALIZE_SPEC.md.
 *
 * Rules:
 * - Unicode NFC
 * - Collapse any run of whitespace (including \\n \\r \\t) to single space
 * - Trim start/end
 * - No zero-width char removal beyond what \\s matches
 */

/**
 * Same as backend normalizeText(). Use for any offset-based comparison.
 */
export function normalizeText(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Same as backend htmlToText(): strip tags only, output text in document order.
 * Used for dev assertion: normalize(htmlToText(html)) should match DOM-derived normalized text.
 */
export function htmlToText(html: string): string {
  if (typeof html !== 'string') return '';
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      i++;
      while (i < html.length && html[i] !== '>') i++;
      if (i < html.length) i++;
      continue;
    }
    out += html[i];
    i++;
  }
  return out;
}

/**
 * Dev-only: return true if canonical (from server) and DOM-derived normalized text match byte-identical.
 */
export function canonicalMatchesDomNormalized(canonical: string, domNormalized: string): boolean {
  return canonical === domNormalized;
}
