/**
 * Normalize PDF/DOCX-derived text before POST /extract (must stay aligned with Edge
 * `sanitizePageText` / `stripInvalidUnicodeForDb` in supabase/functions/_shared).
 *
 * Order: NFC → well-formed UTF-16 → strip C0 controls (keep \t \n \r) → caller may add JSON escapes.
 */
export function prepareUnicodeForExtractTransport(raw: string): string {
  let s = (raw ?? "").normalize("NFC");
  if (typeof (s as { toWellFormed?: () => string }).toWellFormed === "function") {
    s = s.toWellFormed();
  } else {
    s = replaceIllFormedUtf16(s);
  }
  return s
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** Fallback when `String.prototype.toWellFormed` is unavailable (older browsers). */
function replaceIllFormedUtf16(str: string): string {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 0) continue;
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += str.slice(i, i + 2);
        i++;
        continue;
      }
      out += "\uFFFD";
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    out += str.charAt(i);
  }
  return out;
}
