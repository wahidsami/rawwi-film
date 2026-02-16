# Report Print / Export — Implementation Map & Fix Targets

**Goal:** Map how report export/print is built and identify why A4 printing no longer wraps correctly in production.

---

## A) Current Implementation Map

### 1. Button location and handlers

| Location | File | Component / handler | What it does |
|----------|------|----------------------|--------------|
| **Report view (single report)** | `apps/web/src/pages/Results.tsx` | Button with `onClick={generateHtmlPrint}` (line ~634) | Label: **"Export PDF"** (AR: "تصدير PDF") but **actually runs HTML print flow** (fetches template, opens new window, `window.print()`). |
| **Reports list** | `apps/web/src/pages/Reports.tsx` | `handlePrint` (line 69–71) | **Does not print.** Only navigates to report: `handleOpen(report)` → `/report/:id?by=job`. User must then use the button on Results page to print. |
| **Audit page** | `apps/web/src/pages/Audit.tsx` | `handleExportPdf` (line 89) | Fetches **server PDF**: `GET ${API_BASE_URL}/reports/audit.pdf?...`, then opens blob in new window and calls `win.print()` (line 220). |
| **Glossary page** | `apps/web/src/pages/Glossary.tsx` | `handleExportPdf` (line 63) | Same: fetches **server PDF** `reports/glossary.pdf`, then new window + print. |
| **Clients page** | `apps/web/src/pages/Clients.tsx` | `handleExportPdf` (line 64) | Same: fetches **server PDF** `reports/clients.pdf`, then new window + print. |
| **Overview** | `apps/web/src/pages/Overview.tsx` | Print flow (line 187) | Fetches `/src/templates/dashboard-report-template.html`, writes to new window, `win.print()`. |
| **ClientDetails** | `apps/web/src/pages/ClientDetails.tsx` | Export PDF + print (lines 301, 435) | Fetches `/src/templates/client-detail-report-template.html`, then print. |

So:

- **Analysis report (Results):** Print/“Export PDF” = **HTML only** (template + new window + print). **No** call to Edge `reports/analysis.pdf`.
- **Audit / Glossary / Clients:** “Export PDF” = **server PDF** from Edge (`reports/audit.pdf`, `reports/glossary.pdf`, `reports/clients.pdf`) then print that PDF in a new window.

### 2. Route(s) involved

- **Report view (where print is triggered):** Route `/report/:id` (or `/report/:jobId?by=job`) → **Results** page (`apps/web/src/pages/Results.tsx`).
- No dedicated “print” route; print is triggered in-place from Results.

### 3. API calls (Analysis report only)

- **No** Edge Function call for Analysis report print/export.
- The only network call for Analysis print is:  
  **`fetch('/src/templates/report-template.html')`** (Results.tsx line 232).  
  This is a **same-origin request for a static HTML file** (no Edge, no PDF).

### 4. HTML generation method (Analysis report)

- **Template:** Static file `apps/web/src/templates/report-template.html` (handlebar-style placeholders: `{{lang}}`, `{{scriptTitle}}`, `{{#each groupedFindings}}`, etc.).
- **Flow:**
  1. `generateHtmlPrint()` in Results.tsx fetches the template (see above).
  2. Builds a `replacements` map from report/summary/findings.
  3. Replaces placeholders with `html.split(key).join(val)` and a regex for `{{#each groupedFindings}}...{{/each}}` to inject findings HTML.
  4. `window.open('', '_blank')` → `win.document.write(html)` → `win.document.close()` → after 500 ms, `win.print()`.
- **Rendering:** The new window’s document is **only** the written HTML string. It does **not** load the SPA’s CSS/JS; it uses **only** the `<style>` block inside the template.

### 5. CSS controlling A4 printing

**Two separate layers:**

| Source | Path | How it’s used for print |
|--------|------|--------------------------|
| **App global print styles** | `apps/web/src/index.css` (lines 63–111) | `@media print { @page { size: A4; margin: 20mm 15mm; } ... }`, `.print\:hidden`, `.print\:break-inside-avoid`, `.print\:break-before`. **Not** applied to the Analysis print window (that window never loads the app; it only has the template HTML). |
| **Template inline styles** | `apps/web/src/templates/report-template.html` (inline `<style>`) | **This is the only CSS that applies to the Analysis report print window.** Contains: `@page { size: A4; margin: 15mm; }`, `break-inside: avoid` / `page-break-inside: avoid` on `.finding-card`, `page-break-after: always` on `.cover-page`, `.article-group` / `.finding-card` layout, fixed `.page-footer`, etc. |

So for “Print Report” on the Analysis (Results) page:

- **A4 layout is defined only in** `report-template.html`’s inline `<style>`.
- The app’s `index.css` print rules apply when printing **from the main app window** (e.g. if user did Ctrl+P on the Results page), not when printing from the **template-only** popup.

**Presence in template:**

- `@page { size: A4; margin: 15mm; }` — **present** (template lines 40–43).
- No separate `@media print` in template; the template is **intended** for print (all styles apply in that window).
- `break-inside: avoid` / `page-break-inside: avoid` — **present** on `.finding-card` (lines 252–254).
- `page-break-after: always` — **present** on `.cover-page` (line 109).
- No explicit scaling/width constraint for “A4 viewport” in the template (e.g. no `max-width: 210mm` on body); layout relies on `@page` and content flow.

---

## B) “Old behaviour” reconstruction

- **Where the “HTML file of actual report” is generated:**  
  In the **browser**, in `Results.tsx` → `generateHtmlPrint()`: it loads the **static** HTML file `report-template.html`, fills placeholders with current report/findings data, then opens a **new window** and writes that single HTML string (no React, no app shell).

- **Was it removed, replaced, or bypassed?**  
  **Bypassed in production.** The flow is unchanged, but the **template URL** is wrong in production:
  - **Dev:** `fetch('/src/templates/report-template.html')` is served by Vite from the project’s `src/templates/` (dev server serves source).
  - **Prod:** Build output lives in `dist/`. Vite does **not** copy `src/templates/*.html` into `dist/`. So the same fetch becomes a request to `https://<origin>/src/templates/report-template.html`, which returns **404**. So:
    - Template never loads → “Could not load report template” → toast “Failed to generate report” (or similar).
    - Either no print window opens, or an empty/broken window is printed.
  - So the **A4 layout** (in the template) is never applied in production, because the template HTML (and its `@page` / A4 rules) is never delivered.

- **Server-side PDF (analysis):**  
  Edge Function `reports/index.ts` has a branch for `pathRest === "analysis.pdf"` that fetches report + findings and then uses `data-mapper.ts` + `pdf-renderer.ts` + `templates/report-template.html` (server path). That branch ends with **`return new Response(null, { status: 501, statusText: "Not Implemented" })`** (line 214). So server-side analysis PDF is **intentionally disabled**. The UI does not call `reports/analysis.pdf`; it only uses the client-side HTML print path above.

---

## C) Fix targets

### Top 3 files that likely need changes

1. **`apps/web/src/pages/Results.tsx`**  
   - **Issue:** Template URL `'/src/templates/report-template.html'` 404s in production.  
   - **Change:** Either:
     - Serve the template from a URL that exists in prod (e.g. put template in `public/templates/report-template.html` and fetch `'/templates/report-template.html'`), or  
     - Inline the template (e.g. import as raw string or embed in the bundle) so no fetch is needed.  
   - This unblocks the “old” HTML print flow so the template (and its A4 CSS) is used again in production.

2. **`apps/web/src/templates/report-template.html`**  
   - **Role:** Contains the only CSS that runs in the Analysis print window (`@page`, `.finding-card` break rules, `.cover-page` page-break, footer).  
   - **Optional hardening:** Add explicit A4 content width if needed, e.g. `body { max-width: 210mm; margin: 0 auto; }` for very wide viewports, and ensure no overflow that could break wrapping. No change required if the only bug was template not loading.

3. **Build / asset pipeline (e.g. Vite)**  
   - **Issue:** `src/templates/*.html` are not part of the production bundle or static copy.  
   - **Change:** Either copy `src/templates/` into `public/` (or build output) and use public URLs, or configure Vite to include template(s) as static assets so the current `/src/templates/...` path is valid in prod (less common).  
   - Same fix benefits Overview, ClientDetails, Audit, Clients, Glossary if they rely on `/src/templates/...` in production (they use the same pattern).

### Exact missing/incorrect CSS (for A4 wrapping) — identification only

- **Not missing in the template:** The template already has:
  - `@page { size: A4; margin: 15mm; }`
  - `break-inside: avoid` and `page-break-inside: avoid` on `.finding-card`
  - `page-break-after: always` on `.cover-page`
- **Why A4 “no longer wraps” in production:** The template (and thus these rules) is **never loaded** in production because of the 404. So the “missing” fix is **getting the template to load**, not adding new rules.
- **Optional extra rules** (if after fixing the 404 there are still wrap/break issues):
  - On `body` or a main content wrapper: `max-width: 210mm; margin: 0 auto;` to keep content within A4 width when the window is wide.
  - On long blocks (e.g. evidence or titles): `overflow-wrap: break-word; word-break: break-word;` (template already has similar on `.evidence-box`).

---

## Cross-check with repo (Edge PDF and docs)

- **`supabase/functions/reports/index.ts`**  
  - **analysis.pdf:** Implemented up to fetching report + findings and calling `prepareReportData` + `renderPdfFromTemplate` (with a server-side template path), then **returns 501 Not Implemented**. No pdfMake in this branch.  
  - **audit.pdf / glossary.pdf / clients.pdf:** Not present in the searched sections; the file header comment says those legacy PDF routes were “removed,” but `reports/index.ts` still contains the analysis.pdf branch (501). So Audit/Glossary/Clients PDF may be implemented elsewhere or by a different deploy; the **frontend** still calls `reports/audit.pdf`, `reports/glossary.pdf`, `reports/clients.pdf` (auditService, glossaryService, clientsService).

- **`supabase/functions/_shared/pdfMake.ts`**, **pdfTemplates.ts**, **pdfVfs.ts**, **scripts/build-pdf-vfs.mjs**  
  - Used for **server-side** PDF generation (pdfmake, fonts, doc definitions).  
  - **Not** used by the **Analysis** report print path in the app; that path is 100% client-side HTML (template + print).  
  - So for “Print Report” (Analysis), the PDF export report and pdfMake pipeline are **relevant only** if you later switch the Analysis flow to use `reports/analysis.pdf` (and implement it with pdfMake or similar). Currently they do not affect the broken “Print Report” behaviour.

---

## Summary

| Question | Answer |
|----------|--------|
| What triggers print/export for the main report? | Results page button labeled “Export PDF” → `generateHtmlPrint()` (HTML path only). |
| HTML vs PDF? | Analysis: **HTML only** (template + new window + print). Audit/Glossary/Clients: **server PDF** then print. |
| Endpoints for Analysis print? | **None.** Only `fetch('/src/templates/report-template.html')` (static file). |
| Where is A4 layout defined? | In **`apps/web/src/templates/report-template.html`** inline `<style>` (`@page`, break rules). App `index.css` print rules do **not** apply to that window. |
| What likely regressed? | **Template URL 404 in production** → template (and its A4 CSS) never loads → print no longer wraps correctly (or fails entirely). |
| Top fix targets | (1) Results.tsx template URL or inlining, (2) report-template.html if layout tweaks needed, (3) build so template is available in prod. |

No code or instrumentation changes were made; this document is mapping and fix-target identification only.
