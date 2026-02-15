# Normalization spec (canonical text for offsets)

One implementation must be used everywhere so that AI/manual finding offsets align with the formatted viewer.

## Transform (identical backend + frontend)

1. **Unicode:** `s.normalize("NFC")`
2. **Whitespace:** Replace any run of one or more whitespace characters (including `\n`, `\r`, `\t`, and any Unicode `\s`) with a single space: `.replace(/\s+/g, " ")`
3. **Trim:** `.trim()` (strip leading/trailing whitespace)
4. **Zero-width / special:** No explicit removal. `\s` in JS already matches common space-like chars; we do not add extra stripping.

## Where it is used

- **Backend:** `supabase/functions/_shared/utils.ts` → `normalizeText(raw)`
- **Backend:** Extract and tasks use `normalizeText(htmlToText(contentHtml))` or `normalizeText(extractedText)` for `script_text.content`.
- **Frontend:** `apps/web/src/utils/canonicalText.ts` → `normalizeText(raw)` (must match backend).
- **Frontend:** `apps/web/src/utils/domTextIndex.ts` → uses `normalizeText` from `canonicalText.ts` for `buildDomTextIndex` so `normalizedText` is byte-identical to `script_text.content` when the DOM is rendered from the same HTML.

## htmlToText (tag-strip only)

- **Backend:** `_shared/utils.ts` → `htmlToText(html)`: skip anything between `<` and `>`, output all other characters in order.
- **Frontend:** `canonicalText.ts` → `htmlToText(html)`: same algorithm.
- Used so that `normalize(htmlToText(html))` matches the string we get from walking the rendered DOM and normalizing (TreeWalker text nodes concatenated then normalized).

## Assertion (dev)

When we have both `editorData.content` (canonical from server) and `domTextIndex.normalizedText` (from formatted container), they must be byte-identical. If not, either normalization differs or the DOM content (e.g. after sanitization) differs from the server’s HTML.
