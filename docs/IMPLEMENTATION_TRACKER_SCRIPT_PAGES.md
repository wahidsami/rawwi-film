# Implementation Tracker: Script Pages, Formatting & PDF-like Workspace

Use this document to track progress. Check off steps as you complete them. Steps are ordered by dependency.

**Constants (use everywhere):**
- Page separator for full content: `"\n\n"` (fixed; same order → same `script_text.content` and hash).
- `script_text.content` = `pages[1].content + SEP + pages[2].content + ...` when pages exist.

**Reference:** Full design and risks → `docs/PLAN_SCRIPT_PAGES_AND_FORMATTING.md`.

---

## Phase 1 — Quick wins (no schema change)

### 1.1 Arabic display in workspace

- [x] **1.1.1** Add an Arabic-joining font to the workspace script viewer (e.g. Amiri or Noto Naskh Arabic via Google Fonts or local).  
  - File: `apps/web/src/pages/ScriptWorkspace.tsx` (editor container classes).  
  - CSS: `font-family: 'Amiri', 'Noto Naskh Arabic', serif;` (or equivalent) on the script content div(s).

- [x] **1.1.2** Confirm the script content container has `dir="rtl"` and `lang="ar"` when displaying Arabic (already in place; verify and keep).

- [ ] **1.1.3** (Optional) In PDF extraction, research/apply logical-order Unicode or presentation-form normalization so stored text joins better.  
  - File: `apps/web/src/utils/documentExtract.ts`.

### 1.2 Formatting (DOCX)

- [x] **1.2.1** Audit extract/import flow: ensure we never overwrite or drop `content_html` when we already have it (DOCX path).  
  - Files: `apps/web` (upload/extract call), `supabase/functions/extract/index.ts`.

- [x] **1.2.2** Ensure workspace keeps showing `content_html` when present in the single long view (no regression).

---

## Phase 2 — Page storage and extraction

### 2.1 Schema

- [x] **2.1.1** Create migration: add table `script_pages` with columns:  
  - `version_id` (uuid, FK to `script_versions(id) ON DELETE CASCADE)`  
  - `page_number` (int, 1-based)  
  - `content` (text, NOT NULL)  
  - `content_html` (text, nullable)  
  - Primary key: `(version_id, page_number)`  
  - Index: `version_id` for listing pages by version.

- [ ] **2.1.2** (Optional) Add nullable `page_number` to `analysis_findings` in a separate migration (for “finding on page X” and reports).

### 2.2 Backend: extract Edge function

- [x] **2.2.1** Extend extract request body to accept optional `pages?: Array<{ pageNumber: number; text: string; html?: string | null }>`.  
  - File: `supabase/functions/extract/index.ts`.

- [x] **2.2.2** When `pages` is provided and non-empty:  
  - Insert/upsert rows into `script_pages` for the given `version_id` (replace all pages for that version: delete existing then insert, or upsert by (version_id, page_number)).  
  - Build `normalizedContent` = concatenation of `pages[].text` (or normalized text per page) with fixed separator `"\n\n"`.  
  - Set `script_text.content` = that concatenation, `content_hash` = hash of it.  
  - Set `script_text.content_html` = null when using pages (or keep a legacy full HTML if we have one; otherwise null).  
  - Still call existing `saveScriptEditorContent` (or equivalent) so `script_text` and `script_sections` stay in sync.

- [x] **2.2.3** When `pages` is not provided (legacy): keep current behaviour (use `text` / `contentHtml` as today; no `script_pages` rows).

- [x] **2.2.4** Ensure extract still supports the old single `text` (+ optional `contentHtml`) path so existing clients and DOCX-without-pages keep working.

### 2.3 Backend: GET editor / script pages API

- [x] **2.3.1** Extend GET editor (or add GET script pages) to load `script_pages` for the version when present.  
  - File: `supabase/functions/scripts/index.ts` (or where GET editor lives).

- [ ] **2.3.2** Return in response: `pages?: Array<{ pageNumber: number; content: string; contentHtml?: string | null; startOffsetGlobal?: number }>`.  
  - Compute `startOffsetGlobal` per page: page 1 = 0, page 2 = len(page1)+2, etc. (separator length = 2 for `"\n\n"`).

- [x] **2.3.3** When no `script_pages` rows exist, return existing `content`, `contentHash`, `contentHtml`, `sections` only (no `pages` or `pages: []`).

### 2.4 Client: PDF extraction per page

- [x] **2.4.1** Change PDF extraction to return per-page data instead of one joined string.  
  - File: `apps/web/src/utils/documentExtract.ts`.  
  - New signature e.g. `extractTextFromPdfPerPage(file): Promise<Array<{ pageNumber: number; text: string }>>`.

- [x] **2.4.2** Keep a helper that returns full text (join with `"\n\n"`) for callers that still need a single string, or switch callers to use pages only.

### 2.5 Client: DOCX and “pages”

- [ ] **2.5.1** For DOCX: either detect page breaks from mammoth output (if available) and split HTML/text into pages, or use a simple heuristic (e.g. split by every N characters or by paragraph count) to produce `pages[]`.  
  - File: `apps/web` (where DOCX is processed before calling extract).

- [ ] **2.5.2** Send `pages` to `/extract` when we have them (PDF always; DOCX when we implement split).

### 2.6 Client: call extract with pages

- [x] **2.6.1** When uploading PDF: call extract with `pages` array (and no top-level `text`), or send both `text` (concatenation) and `pages` so backend can prefer `pages` when present.  
  - File: `apps/web/src/pages/ScriptWorkspace.tsx` (or upload/extract flow) and `apps/web/src/api` (extract request body).

- [x] **2.6.2** Ensure request body shape matches backend: `pages: [{ pageNumber, text, html? }]`.

### 2.7 Offset → page (for later use)

- [ ] **2.7.1** Add a small helper or API that, given `version_id` and global offset, returns page number (using stored page boundaries or `startOffsetGlobal` per page).  
  - Can be client-side if editor response includes `pages[].startOffsetGlobal` and page lengths; or a tiny Edge/API that returns page boundaries.

---

## Phase 3 — Page-based workspace UI

### 3.1 State and data

- [ ] **3.1.1** In ScriptWorkspace (or script viewer component), add state: `currentPage: number`, `totalPages: number`, `zoomLevel: number` (e.g. 1.0 = 100%).  
  - File: `apps/web/src/pages/ScriptWorkspace.tsx`.

- [ ] **3.1.2** When editor response includes `pages`, set `totalPages = pages.length` and default `currentPage = 1`. When no pages, keep single “long page” mode (totalPages = 1 or treat as one block).

### 3.2 Toolbar component

- [ ] **3.2.1** Add a toolbar above (or beside) the script viewer with:  
  - Page indicator: “2 / 472” (currentPage / totalPages).  
  - Previous / Next buttons (disabled when at first/last page).  
  - Zoom out, zoom level label (e.g. “110%”), zoom in.  
  - File: new component e.g. `apps/web/src/components/ScriptViewerToolbar.tsx` or inline in ScriptWorkspace.

- [ ] **3.2.2** Wire toolbar to state: changing page updates `currentPage`; zoom buttons update `zoomLevel` (e.g. step 0.1 or 10%).

### 3.3 Viewer: render current page

- [ ] **3.3.1** When `pages` exist and `totalPages > 0`, render only the current page’s content in the main viewer area.  
  - Use `pages[currentPage - 1].content` or `contentHtml` (prefer `contentHtml` when present).  
  - Same container as today (RTL, Arabic font, etc.).

- [ ] **3.3.2** Apply zoom: e.g. `transform: scale(zoomLevel)` on the content wrapper, or adjust font-size. Ensure layout doesn’t break (overflow, scrolling).

- [ ] **3.3.3** (Optional) Preload adjacent page content for snappier Prev/Next.

### 3.4 Highlights on current page only

- [ ] **3.4.1** Compute which findings belong to the current page: use `start_offset_global` and page boundaries (startOffsetGlobal per page) to determine if a finding’s range intersects the current page.

- [ ] **3.4.2** When in page view, only insert highlight spans for findings that fall on the current page. For single-page (no pages) mode, keep current behaviour (all highlights on the one view).

- [ ] **3.4.3** Optional: when resolving selection to offsets, map from “offset in current page” to global offset using page’s `startOffsetGlobal`.

### 3.5 “Go to page of finding”

- [ ] **3.5.1** In the findings sidebar (or card), add “Go to page” (or “Show in script”) that sets `currentPage` to the finding’s page and optionally focuses the viewer.  
  - Use `page_number` on finding if present; otherwise compute from offset and page boundaries.

### 3.6 Backward compatibility (no pages)

- [x] **3.6.1** When editor returns no `pages` (or empty), show the existing single long content (current behaviour), hide or simplify toolbar (e.g. no page nav, only zoom).  
  - totalPages = 1, currentPage = 1, render full `content` / `contentHtml`.

---

## Phase 4 — Finding page number and reports (optional)

### 4.1 Store page_number on findings

- [ ] **4.1.1** When inserting a finding (worker or manual), if we have page boundaries for that version, compute page from `start_offset_global` and set `analysis_findings.page_number`.  
  - Worker: `apps/worker` (where findings are written); need to pass page boundaries or fetch them.  
  - Manual: `supabase/functions/findings/index.ts` (when creating manual finding).

- [ ] **4.1.2** Backfill: optional one-off to set `page_number` for existing findings where version has `script_pages` (compute from offset + boundaries).

### 4.2 Report: show “Page X”

- [ ] **4.2.1** In the analysis report template (HTML or React), show “Page X” next to each finding when `page_number` is set (or derivable).  
  - Files: report template(s) under `apps/web` or `supabase/functions/reports`.

- [ ] **4.2.2** Optional: link “Page 12” to open workspace at that script version and page (e.g. hash or query param `?page=12`).

---

## Checklist summary

| Phase | Description                    | Steps (approx) |
|-------|--------------------------------|----------------|
| 1     | Arabic font, DOCX preserve HTML| 5              |
| 2     | Schema, extract, API, client   | 15+            |
| 3     | Page UI, toolbar, highlights   | 10+            |
| 4     | Finding page, reports          | 4              |

**Order:** Complete Phase 1 first, then Phase 2 (schema → backend → client), then Phase 3, then Phase 4 as needed.

When implementing, tick off each box and note any deviation or new step in this file so the plan stays accurate.
