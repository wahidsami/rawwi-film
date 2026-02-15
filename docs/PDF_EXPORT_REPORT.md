# PDF Export Functionality — Complete Report

This document describes the PDF export feature in the RawwiFilm project: how it was designed, what issues appeared, and how they were addressed.

---

## 1. Overview

The application generates PDF reports from the **reports** Edge Function (Supabase/Deno). Four report types are supported:

| Report        | Endpoint              | Permission        | Description                          |
|---------------|-----------------------|-------------------|--------------------------------------|
| Analysis      | `GET /reports/analysis.pdf`  | Report ownership  | Findings and summary per analysis job |
| Audit Log     | `GET /reports/audit.pdf`     | `view_audit`      | Filtered audit events                |
| Glossary      | `GET /reports/glossary.pdf`  | `manage_glossary` | Lexicon terms and KPIs               |
| Clients       | `GET /reports/clients.pdf`   | `manage_companies`| Clients and script counts            |

All support **Arabic (ar)** and **English (en)** via `?lang=ar` or `?lang=en`, with RTL/LTR and optional **Cairo** font for Arabic when available.

---

## 2. Architecture

### 2.1 Main components

| Component | Path | Role |
|-----------|------|------|
| **Reports function** | `supabase/functions/reports/index.ts` | HTTP handlers; builds doc and calls `createPdfBuffer()` |
| **pdfMake** | `supabase/functions/_shared/pdfMake.ts` | Loads pdfmake (esm.sh), configures fonts, sanitizes doc, creates PDF buffer |
| **pdfVfs** | `supabase/functions/_shared/pdfVfs.ts` | Generated file: base64 font data + `getVendoredVfs()`, `getFontBytes()`, `hasCairoFonts()` |
| **pdfTemplates** | `supabase/functions/_shared/pdfTemplates.ts` | pdfmake document definitions (cover, tables, styles) for each report type |
| **Build script** | `scripts/build-pdf-vfs.mjs` | Reads `.ttf` from `_shared/fonts/`, writes base64 into `pdfVfs.ts` |
| **Fonts** | `supabase/functions/_shared/fonts/` | Roboto (Regular, Medium, Italic) and Cairo (Regular, Bold) `.ttf` files |

### 2.2 Data flow

1. Client calls `GET /reports/<type>.pdf?lang=...&...`.
2. **reports** function: auth + permission check, fetches data from Supabase, builds input for the template.
3. **pdfTemplates**: `buildAnalysisReportDoc()`, `buildAuditReportDoc()`, etc. return a pdfmake **document definition** (content, defaultStyle, header, footer).
4. **pdfMake**: `createPdfBuffer(doc)` loads pdfmake once, sanitizes the doc, passes fonts (as `Uint8Array`) and doc to `createPdf(doc, options).getBuffer()`.
5. **pdfVfs**: Font bytes come from `getFontBytes(filename)` (base64 decoded from `VENDORED_VFS`). No file system access at runtime.
6. Response: PDF binary with `Content-Type: application/pdf` and `Content-Disposition: attachment`.

### 2.3 Font strategy

- **Runtime:** Deno Edge (Supabase). No Node `fs`; no reliable path-based `readFile` for `.ttf`.
- **Approach:** Fonts are embedded at **build time** by `build-pdf-vfs.mjs` into `pdfVfs.ts` as base64. At runtime, `getFontBytes()` decodes to `Uint8Array` and pdfMake is given **font buffers** (not file paths), so the runtime never performs `readFile('*.ttf')`.
- **Families:** Roboto (normal, bold, italics, bolditalics) and, when present, Cairo (normal, bold). Arabic reports use Cairo when `hasCairoFonts()` is true, else Roboto.

---

## 3. How It Started

- PDF export was added using **pdfmake** to generate documents from structured definitions.
- Initially the idea was to use pdfmake’s **VFS** (virtual file system) for fonts: a map of filenames to base64 strings, as in the **browser** usage.
- On the **server** (Node/Deno), pdfmake’s default behaviour is to load fonts from the **file system** by path. The official docs state that the VFS approach is for **client-side** use; **server-side** is expected to use “real font files” (paths).
- In our environment (Supabase Edge/Deno), there is no stable filesystem for those paths; the bundle runs in a sandbox and path-based reads led to “path not found” errors. So we had to adapt the approach to work without any `readFile('*.ttf')` at runtime.

---

## 4. Issues Encountered and Modifications

### 4.1 pdfmake loading in Edge (Deno)

- **Issue:** Using `npm:pdfmake` or Node-style imports in the Edge Function caused “Module not found” / “path not found” in the Supabase/Deno runtime.
- **Change:** Load pdfmake from **esm.sh** so it runs in Deno:
  - `import("https://esm.sh/pdfmake@0.3.3?target=deno")`.
- **Result:** pdfmake loads correctly in the Edge Function.

---

### 4.2 createPdf options type

- **Issue:** “Parameter 'options' has an invalid type. Object expected.” when passing `null` or missing options.
- **Change:** Always pass an options object, e.g. `createPdf(doc, { fonts: pdfMake.fonts ?? cachedFonts })`, and never `null`.
- **Result:** createPdf receives a valid options object.

---

### 4.3 getBuffer API (Promise vs callback)

- **Issue:** esm.sh’s pdfmake 0.3 returns a **Promise** from `getBuffer()`; code that only used the callback never got the buffer and could cause unhandled rejections.
- **Change:** In `createPdfBuffer()`, treat the return value as possibly a Promise and await it; otherwise use the callback form. Normalize the result to `Uint8Array`.
- **Result:** PDF buffer is correctly awaited and returned; no unhandled rejections from getBuffer.

---

### 4.4 CORS on PDF responses

- **Issue:** “No Access-Control-Allow-Origin header” when requesting PDFs from the browser. Unhandled errors in the function could cause the gateway to return 502 without CORS headers.
- **Change:** Ensure all error paths are caught and responses (including errors) go through the same CORS helper. Keep using `supabase functions serve --no-verify-jwt` (or equivalent) so OPTIONS reaches the function and CORS headers are applied.
- **Result:** Successful and failed PDF responses include proper CORS headers when the function is running and handling the request.

---

### 4.5 Roboto fonts “not defined”

- **Issue:** “Font 'Roboto' in style 'normal' is not defined.” Initially, fonts were expected from an external VFS (e.g. CDN) that didn’t load in the Edge context.
- **Change:** **Vendor all fonts** locally. Add Roboto (and Cairo) `.ttf` files under `supabase/functions/_shared/fonts/`, and a **build step** that writes their base64 into `pdfVfs.ts` (via `scripts/build-pdf-vfs.mjs`). Use that as the only source of font data.
- **Result:** Roboto is always defined from the vendored VFS; no external font dependency at runtime.

---

### 4.6 Cairo fonts “not defined” / path not found

- **Issue 1:** “Font 'Cairo' in style 'normal' is not defined.” Cairo was in the fonts config and in the VFS map, but the **server** build of pdfmake expects a **virtualfs** with `existsSync(path)` and `readFileSync(path)` (Node-style), not a plain `{ filename: base64 }` map.
- **Attempt:** We added a **virtualfs adapter** that wrapped the base64 VFS and exposed `existsSync` and `readFileSync`. The esm.sh server build still tried to read from the real filesystem (e.g. `readFile('Cairo-Regular.ttf')`), leading to:
- **Issue 2:** “path not found: .../reports/Cairo-Regular.ttf” — the runtime was resolving the font **filename** as a path relative to the function directory.
- **Change:** Stop passing **font file paths** altogether. Decode base64 to bytes and pass **font data as `Uint8Array`** in the fonts config (e.g. `Cairo: { normal: cairoNormalBytes, bold: cairoBoldBytes }`). Added `getFontBytes(filename)` in `pdfVfs.ts` and `buildFontsWithBuffers()` in `pdfMake.ts` so the library only receives buffers, never paths.
- **Result:** No `readFile('*.ttf')` in the bundle; Cairo (and Roboto) work when the corresponding fonts are present in the VFS and the build has been run.

---

### 4.7 “Cannot read properties of undefined (reading 'toLowerCase')”

- **Issue:** pdfmake (or our code) called `.toLowerCase()` on an undefined value. Two sources were identified and fixed.

**A) Query parameter in reports function**

- In the **glossary.pdf** handler, `isActiveParam` was set as:
  - `url.searchParams.get("isActive")?.trim().toLowerCase()`
- When `isActive` was absent, `get("isActive")` is `null`, so `?.trim()` is `undefined`, and `.toLowerCase()` threw.
- **Change:** `const isActiveParam = (url.searchParams.get("isActive") ?? "").trim().toLowerCase();`
- **Result:** No `.toLowerCase()` on undefined from this param.

**B) Undefined text/font in the document definition**

- pdfmake (or its internals) may call `.toLowerCase()` on node properties (e.g. `text` or `font`). If any node had `text: undefined` or `font: undefined`, this could throw.
- **Change 1 — Doc sanitizer in pdfMake.ts:** Before calling `createPdf()`, the document is passed through `sanitizeDoc()`, which recursively:
  - Sets any `text` that is `null`/`undefined` to `""`.
  - Ensures `font` is always a string (default `"Roboto"` if missing or invalid).
  - Recurses into `content`, `body`, `table.body`, and nested objects; leaves header/footer functions unchanged.
- **Change 2 — Templates:** In `pdfTemplates.ts`, all fields used as `text` in tables are normalized so they are never undefined when passed to pdfmake (e.g. `e.eventType ?? ""`, `e.occurredAt ?? ""`, `t.term ?? ""`, `t.term_type ?? ""`, `f.severity ?? ""`, etc.).
- **Result:** pdfmake never receives `undefined` for `text` or `font` in the doc, avoiding internal `.toLowerCase()` on undefined.

---

## 5. Current Implementation Summary

### 5.1 pdfMake.ts

- **Loading:** Single cached instance of pdfmake from `https://esm.sh/pdfmake@0.3.3?target=deno`.
- **Fonts:** Built by `buildFontsWithBuffers()` from `getFontBytes()` (base64 → `Uint8Array`). Roboto (normal, bold, italics, bolditalics) always; Cairo (normal, bold) if `hasCairoFonts()`.
- **Doc:** Every doc is sanitized with `sanitizeDoc()` before `createPdf(sanitized, { fonts })`.
- **Buffer:** `getBuffer()` return value is handled as either Promise or callback; result is normalized to `Uint8Array` and returned from `createPdfBuffer(doc)`.

### 5.2 pdfVfs.ts (generated)

- **VENDORED_VFS:** `Record<string, string>` of filename → base64, filled by `build-pdf-vfs.mjs`.
- **getVendoredVfs():** Returns a copy of that map (kept for possible future use).
- **getFontBytes(filename):** Returns `Uint8Array` decoded from base64, or `null` if missing/empty.
- **hasCairoFonts():** True when both `Cairo-Regular.ttf` and `Cairo-Bold.ttf` have non-empty base64 in `VENDORED_VFS`.

### 5.3 pdfTemplates.ts

- **Report builders:** `buildAnalysisReportDoc`, `buildAuditReportDoc`, `buildGlossaryReportDoc`, `buildClientsReportDoc` each take a typed input and return a pdfmake document definition (pageSize, pageMargins, defaultStyle, header, footer, content).
- **Language/font:** `defaultFont(lang, fontForAr)` returns `"Cairo"` or `"Roboto"`; templates use `getFontForAr()` from pdfMake so the default font always exists in the fonts config.
- **RTL/LTR:** `baseStyle(lang)` sets `alignment` and `direction` by language. All user-visible strings are localized (ar/en) in the templates.

### 5.4 reports/index.ts

- **Analysis PDF:** `generateAnalysisPdf()` builds input from report + findings + script/client, calls `buildAnalysisReportDoc()` with `fontForAr: getFontForAr()`, then `createPdfBuffer(doc)`.
- **Audit / Glossary / Clients PDFs:** Same pattern: build input from DB and query params, call the corresponding `build*ReportDoc()` with `fontForAr: getFontForAr()`, then `createPdfBuffer(doc)`.
- **Query params:** `lang` and other params (e.g. `isActive` for glossary) are read with safe defaults; `.toLowerCase()` is only called on strings (e.g. `(url.searchParams.get("isActive") ?? "").trim().toLowerCase()`).

---

## 6. Build and Deploy

### 6.1 Fonts and VFS (required before PDF works)

1. Place font files in `supabase/functions/_shared/fonts/`:
   - **Roboto:** Roboto-Regular.ttf, Roboto-Medium.ttf, Roboto-Italic.ttf
   - **Cairo (optional for Arabic):** Cairo-Regular.ttf, Cairo-Bold.ttf  
   (See `_shared/fonts/README.md`; e.g. download from Google Fonts.)
2. From project root run:
   ```bash
   node scripts/build-pdf-vfs.mjs
   ```
   This regenerates `supabase/functions/_shared/pdfVfs.ts` with base64 font data.
3. Restart Edge Functions (or redeploy) so the new `pdfVfs.ts` is used.

### 6.2 Local run

- Start Supabase and Edge Functions (e.g. `.\start-all.ps1` or `supabase start` + `supabase functions serve --no-verify-jwt`).
- Frontend calls `GET .../reports/<type>.pdf?lang=...&...` with auth; PDF is downloaded.

### 6.3 Deploy (hosted Supabase)

- Link project (if needed): `supabase link --project-ref <ref>`.
- Deploy reports function: `supabase functions deploy reports`.
- Ensure fonts have been built into `pdfVfs.ts` before deploy (or in CI) so the deployed bundle contains font data.

---

## 7. API Endpoints (summary)

| Method | Endpoint | Auth | Permission | Query params |
|--------|----------|------|------------|--------------|
| GET | `/reports/analysis.pdf` | Yes | Report ownership | `jobId`, `lang=ar\|en` |
| GET | `/reports/audit.pdf` | Yes | `view_audit` | `lang`, `dateFrom`, `dateTo`, `eventType`, `targetType`, `resultStatus`, `q` |
| GET | `/reports/glossary.pdf` | Yes | `manage_glossary` | `lang`, `clientId`, `isActive`, `mode`, `severity`, `q` |
| GET | `/reports/clients.pdf` | Yes | `manage_companies` | `lang`, `q`, `dateFrom`, `dateTo` |

All return `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="..."`.

---

## 8. Verification and Troubleshooting

- **VERIFICATION.md** (sections 0.4, 0.5, etc.) describes how to verify Audit, Analysis, Clients, and Glossary PDFs (RTL/LTR, Cairo when available, content, permissions).
- **TROUBLESHOOTING_CORS.md** explains why “No Access-Control-Allow-Origin” often means Edge Functions are not running or OPTIONS is not reaching the function; use `--no-verify-jwt` when calling from the browser.

**Common issues:**

- **“Roboto/Cairo not defined” or “path not found” for .ttf:** Ensure `node scripts/build-pdf-vfs.mjs` has been run after adding fonts and that the function was restarted/redeployed.
- **“toLowerCase of undefined”:** Should be resolved by the isActiveParam fix and the doc sanitizer; if it reappears, check for any new doc nodes with undefined `text` or `font` and add defaults or sanitization.
- **CORS on PDF:** Ensure the reports function is running and that failed requests still return responses through your CORS helper (no unhandled exceptions that result in a gateway 502 without headers).

---

## 9. File Reference

| File | Purpose |
|------|---------|
| `supabase/functions/reports/index.ts` | HTTP handlers for all four PDF endpoints |
| `supabase/functions/_shared/pdfMake.ts` | pdfmake load, font config (Uint8Array), doc sanitizer, createPdfBuffer |
| `supabase/functions/_shared/pdfVfs.ts` | Generated; VFS map, getVendoredVfs, getFontBytes, hasCairoFonts |
| `supabase/functions/_shared/pdfTemplates.ts` | Document definitions for Analysis, Audit, Glossary, Clients |
| `supabase/functions/_shared/fonts/` | Directory for .ttf files; README with instructions |
| `scripts/build-pdf-vfs.mjs` | Embeds fonts from `_shared/fonts/` into `pdfVfs.ts` |
| `docs/VERIFICATION.md` | Steps to verify PDF export behaviour |
| `docs/TROUBLESHOOTING_CORS.md` | CORS and Edge Functions setup |

---

*Report generated for the RawwiFilm project. PDF export uses pdfmake 0.3.3 via esm.sh with vendored fonts and sanitized document definitions to support Analysis, Audit, Glossary, and Clients reports in Arabic and English.*
