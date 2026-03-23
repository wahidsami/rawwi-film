# Unicode & PDF text extraction — what to expect

## Honest scope

- **PDF is not a Unicode document format.** Producers embed glyphs with **font encodings**, **ToUnicode** maps, **CID** fonts, and sometimes **no usable mapping** at all. The same visual Arabic (or Latin) can decode differently—or as garbage—depending on the app that wrote the PDF.
- **Goal:** For PDFs that *do* expose text to PDF.js, make our pipeline **predictable, UTF-8–safe, and Postgres/JSON-safe**. We **cannot** promise “every PDF from every app” without issues; scanned/image PDFs and broken encodings will still fail or look wrong until OCR or manual fix.

## Strategy (best practice for this product)

1. **Extract in the browser** with **PDF.js** (`getTextContent`) — already in place — avoids Edge limits and matches what users see.
2. **Normalize** with **NFC** (Canonical Composition).  
   - Prefer **NFC over NFKC** for screenplay/legal Arabic: NFKC changes compatibility characters (e.g. some punctuation/digit shapes) and can alter meaning or diffing.
3. **Well-formed UTF-16** before JSON/network: use **`String.prototype.toWellFormed()`** when available (ES2024); otherwise replace lone surrogates with U+FFFD (same idea as Postgres-safe storage).
4. **Strip disallowed controls** for storage: remove **NUL** and **C0 controls** except tab/newline/carriage return (aligned with Edge `sanitizePageText`).
5. **JSON transport safety:** escape raw `\` so accidental `\u` in text does not break `JSON.parse` on the server (see `scriptsApi.extractText` `safe()`).
6. **Defense in depth on Edge:** repeat sanitization, **UTF-16-safe chunking** for analysis jobs, and **`stripInvalidUnicodeForDb`** before inserts (see `supabase/functions/_shared/utils.ts`).

## Where it lives

| Stage | Location |
|--------|-----------|
| PDF → strings | `apps/web/src/utils/documentExtract.ts` (`extractTextFromPdfPerPage`) |
| Before `/extract` body | `apps/web/src/utils/extractUnicode.ts` + `apps/web/src/api/index.ts` (`extractText` → `safe`) |
| Edge persist + jobs | `supabase/functions/extract/`, `_shared/serverExtract.ts`, `_shared/utils.ts` |

## QA matrix (recommended)

Keep a small set of **golden PDFs** exported from: **Word**, **Google Docs**, **Adobe Acrobat**, **InDesign** (if used), **macOS Preview**, Arabic-named files, mixed Arabic/Latin, optional emoji. After each PDF.js or extract change, re-import and spot-check three offsets.

## If something still breaks

1. **Supabase Edge Logs** for `extract` (not the app VPS/nginx).
2. Check whether the PDF has **real text** or only images (no text layer).
3. Compare **same file** opened in Acrobat “copy all” vs your editor—if both are wrong, the PDF’s mapping is the root cause, not Raawi.

---

*Last updated: aligns client `prepareUnicodeForExtractTransport` with Edge sanitization.*
