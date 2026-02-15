/**
 * Sanitize HTML for safe rendering (e.g. script_text.content_html in Formatted view).
 * XSS hardening: allow only tags/attrs needed for mammoth DOCX output.
 */
import DOMPurify from 'dompurify';

const FORMATTED_VIEW_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'span', 'div',
];
const FORMATTED_VIEW_ALLOWED_ATTR = ['dir', 'class'];

/**
 * Sanitize HTML for the script Formatted viewer.
 * Strips script, style, iframe, object, embed, and any on* / event attributes.
 */
export function sanitizeFormattedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: FORMATTED_VIEW_ALLOWED_TAGS,
    ALLOWED_ATTR: FORMATTED_VIEW_ALLOWED_ATTR,
  });
}
