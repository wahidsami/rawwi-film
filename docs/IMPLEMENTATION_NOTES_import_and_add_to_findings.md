# Implementation notes: Import (DOCX/PDF) and “Add to findings” UX

## Overview

This document describes the choices made for:

- **A)** DOCX/PDF import without hitting the 501 branch (client-side extraction).
- **B)** Context menu wording and behavior (“Add to findings”, “Add Note”).
- **C)** Article-dependent Atom dropdown in the manual-finding modal.

Reference: `editor-highlights-and-manual-findings-audit.md`, `script-import-and-editor-audit.md`.

---

## A) DOCX/PDF import

### Goal

Ensure `.docx` and `.pdf` never call `/extract` without text. The backend may return 501 when no text is provided; we avoid that by extracting text in the browser first, then calling `scriptsApi.extractText(versionId, extractedText)`.

### Client-side parsing

- **DOCX:** `mammoth` (browser). We use `mammoth.extractRawText({ arrayBuffer })` to get plain text. No server round-trip for extraction.
- **PDF:** `pdfjs-dist` (Mozilla). We initialise the worker once via `GlobalWorkerOptions.workerSrc` using a dynamic import of `pdfjs-dist/build/pdf.worker.mjs` (Vite `?url`). Then we load the document, iterate pages, call `getTextContent()` per page, and join text items. This only works for PDFs with an embedded text layer.

### Scanned PDF / empty text

- If extracted text is empty (e.g. scanned or image-only PDF), we do **not** call `extractText`. We show a clear toast and stop:
  - EN: *"No text found (file may be scanned/image-only)."*
  - AR: *"لم يتم العثور على نص (قد يكون الملف ممسوحاً ضوئياً)."*
- We set upload status to `failed` and return, so the user can try another file or use OCR elsewhere.

### TXT flow

- Unchanged: we still use `file.text()` and then `scriptsApi.extractText(version.id, fileText, { enqueueAnalysis: false })` (and same for DOCX/PDF with extracted text).

### Import does not auto-create analysis reports

- POST `/extract` accepts an optional body field **`enqueueAnalysis`** (default **true** for backward compatibility). When **false**, the edge function only saves extracted/normalized text and `script_text`/sections; it does **not** call `runIngest()` (no analysis job or chunks).
- The frontend import flows (ScriptWorkspace upload and ClientDetails “Add script” popup) call `extractText(versionId, text, { enqueueAnalysis: false })`, so import no longer creates jobs or reports. Analysis jobs/reports are created only when the user clicks “Start Smart Analysis”, which uses POST `/tasks` (unchanged).

### Error handling

- DOCX/PDF extraction errors (e.g. corrupt file, worker load failure) are caught; we show a toast with the error message and rethrow so the outer handler can set status to `failed` and avoid marking the flow as “done”.

---

## B) Context menu and “Add to findings”

### Label change

- The context menu item previously labeled “Mark as Violation” is now **“Add to findings”** (EN) / **“إضافة إلى الملاحظات”** (AR).
- The modal title matches: “Add to findings” / “إضافة إلى الملاحظات”.
- Behaviour and backend call are unchanged: same modal, same `POST /findings/manual` (reportId → job_id linkage, source=manual).

### “Add Note” behaviour (Option 1)

- “Add Note” was a no-op. It is wired to open the **same** “Add to findings” modal and use the same flow:
  - User can set Report, Article, Atom, Severity, Comment and save.
  - Saving still creates a manual finding via `POST /findings/manual` (no separate “note” model).
- If product later requires notes to be distinct from findings, a separate note model and API would be needed (Option 2).

---

## C) Article-dependent Atom dropdown

- A local mapping **articleId → atom options** was added: `ARTICLE_ATOMS[articleId]` gives a list of `{ value, label }` (e.g. “—” plus “1.1”, “1.2”, … “1.10” for article 1).
- The Atom field in the manual-finding modal is now a **dropdown** (Select) instead of a free-text input. Options update when the user changes the Article.
- When Article changes, `atomId` is reset to empty (“—”) so the selection stays consistent.
- Backend already accepts any `atom_id` string; no API changes. If product needs different or per-article atom lists, only the `ARTICLE_ATOMS` mapping (or a future API) needs to change.

---

## C.1) Formatted view: sanitization and highlights hint

### Sanitization (XSS hardening)

- Before rendering `script_text.content_html` in **Formatted** mode, the frontend sanitizes it with **DOMPurify** via `sanitizeFormattedHtml()` (`apps/web/src/utils/sanitizeHtml.ts`).
- Allowed tags: `p`, `br`, `strong`, `em`, `b`, `i`, `ul`, `ol`, `li`, `h1`–`h6`, `blockquote`, `span`, `div` (mammoth output).
- Allowed attributes: `dir`, `class` only. Script, style, iframe, object, embed, and any `on*`/event attributes are stripped.
- This prevents script injection or unsafe attributes when rendering stored HTML.

### Formatted-mode hint

- In **Formatted** mode, a small banner above the content explains that highlights are only visible in **Highlight** mode and includes a **“Switch to Highlight”** button (RTL-friendly). This avoids confusion when findings/highlights are not shown in Formatted view.

---

## D) atom_id as enterprise-safe compound code (e.g. "4.1")

### Goal

Store `atom_id` as a globally meaningful code `ARTICLE.ATOM` (e.g. `"4.1"`) for new manual findings, without breaking existing rows that use legacy slot-only values (`"1"`..`"10"`).

### Write path (new manual findings)

- In the save handler (POST `/findings/manual`), when the user selects an atom:
  - Send `atom_id = \`${formData.articleId}.${formData.atomId}\`` (e.g. `"4.1"`).
  - When no atom is selected (empty / "—"), send `atom_id: null` (or empty string if the API expects that).
- `article_id` is still sent as before (numeric).

### Read path (display)

- All display of atom uses a single helper: **`formatAtomDisplay(articleId, atomId)`**.
  - If `atom_id` contains a dot (e.g. `"4.1"`): display as-is.
  - Else if `atom_id` is legacy (`"1"`..`"10"`): display `article_id.atom_id` (e.g. `"4.1"`).
  - Else (no atom): display only `article_id` (e.g. `"4"`).
- Used in: hover tooltip over a finding span, and report finding cards. Highlight/offset logic is unchanged.

### Backward compatibility

- **Existing data:** Rows with `atom_id` in `"1"`..`"10"` have no dot; the UI builds the compound display from `article_id` + `atom_id`, so they render correctly (e.g. Art 4.1).
- **New data:** New manual findings store `atom_id` like `"4.1"`; the UI shows them as-is.
- Filtering/grouping by article continues to use `article_id`; no change required. Backend stores `atom_id` as a string column with no format validation, so both legacy and compound values are accepted.

### Backend

- No change: the findings edge function and DB store `atom_id` as text and do not validate format. Legacy `"1"` and compound `"4.1"` are both accepted.

---

## Files touched

- `apps/web/package.json` — added `mammoth`, `pdfjs-dist`, `dompurify`.
- `apps/web/src/utils/documentExtract.ts` — `extractTextFromDocx`, `extractTextFromPdf`, PDF worker init.
- `apps/web/src/utils/sanitizeHtml.ts` — `sanitizeFormattedHtml()` (DOMPurify allowlist for Formatted view).
- `apps/web/src/pages/ScriptWorkspace.tsx` — upload branching (TXT/DOCX/PDF), empty-text handling, context menu labels and “Add Note” handler, modal title, Article/Atom selects and `ARTICLE_ATOMS` mapping; `formatAtomDisplay()`, compound `atom_id` on save, and atom display in tooltip and report finding cards.

---

## Verification

- **Import:** Upload a .txt, .docx, and .pdf (with text layer); imported text appears in the viewer (word wrapped, RTL). Run analysis and confirm highlights work.
- **Empty PDF:** Upload a scanned/image-only PDF; toast “No text found (file may be scanned/image-only).” and no 501.
- **Add to findings:** Select text → “Add to findings” or “Add Note” → modal opens → fill and save → manual finding appears and persists.
- **Atom dropdown:** Change Article in the modal; Atom dropdown options update; saving sends the chosen atom_id.
- **atom_id compound:** New manual finding with Article 4 and Atom 4.1 → DB stores `atom_id = "4.1"`. Old finding with `article_id=4`, `atom_id="1"` → UI displays “Art 4.1”. Filtering/grouping by article unchanged.
- **Formatted view:** DOCX with headings/lists/bold renders correctly; `<script>` and `on*=` attributes are stripped. Banner in Formatted mode: “Highlights are available in Highlight mode” + “Switch to Highlight” button.
