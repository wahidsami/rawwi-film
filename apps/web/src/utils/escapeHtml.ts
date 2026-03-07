/**
 * Escape a string for safe insertion into HTML (e.g. report/export templates).
 * Prevents XSS when interpolating user or API data into HTML strings.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe for template use: null/undefined become empty string, then escaped. */
export function escapeHtmlSafe(value: string | null | undefined): string {
  return escapeHtml(value ?? '');
}
