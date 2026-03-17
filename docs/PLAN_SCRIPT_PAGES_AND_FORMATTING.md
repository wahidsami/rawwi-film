# Plan: Script Pages, Formatting, and PDF-like Workspace

This document plans for three related goals after script import (Word or PDF):

1. **Imported script matches original formatting** (headings, bold, layout).
2. **Imported script is split by pages** — each page in the workspace matches one page in the source document; later we can say “finding on page X”.
3. **Workspace has page-based view with tools** — page navigation (e.g. 2 / 472), zoom in/out, similar to a PDF viewer.

It also addresses **Arabic letters not connecting** in the imported view.

---

## Are these doable?

**Yes.** All of the above are doable with a clear data model, extraction changes, and workspace UI changes. The main effort is in (1) storing and serving per-page content with formatting, and (2) changing the workspace from “one long scroll” to “page-based view + toolbar”.

---

## 1. Arabic letters not connected (image 1 vs 2)

**Cause (typical):**

- **PDF:** Some PDFs store Arabic in **presentation form** (isolated character code points, e.g. U+FE70–U+FEFF) or in **visual order**. When we extract with PDF.js `getTextContent()`, we get those code points. When we render them in the browser, we get isolated shapes unless the font does contextual shaping.
- **Rendering:** Even with `dir="rtl"` and `lang="ar"`, if the Unicode is already in presentation form (one code point per shape), the browser may not “re-join” them. Logical-order text (U+0627 U+0644 U+0637 …) with a proper Arabic font will connect; presentation-form text often stays disconnected.

**Doable fixes:**

| Approach | Doable? | Notes |
|----------|--------|--------|
| **A. Ensure logical-order Unicode at extraction** | Yes | When building per-page text from PDF, prefer logical-order output if the library exposes it; or normalize presentation forms → logical where possible (non-trivial but libraries exist). |
| **B. Use a font with Arabic joining** | Yes | In the workspace viewer, use a font that supports Arabic contextual forms (e.g. Amiri, Noto Naskh Arabic, or system Arabic). Already using `dir="rtl"`. |
| **C. Normalize to NFC + ensure no broken surrogates** | Done | We already normalize (NFC) and sanitize; keeps storage safe. |

**Recommendation:**  
- Short term: enforce **B** (CSS: `font-family` with an Arabic joining font) so that any logical-order text we have displays connected.  
- Medium term: for PDF, explore **A** (logical-order extraction or conversion) so stored text is in a form that joins correctly.

---

## 2. Formatting (match original document)

**Current state:**

- **Word (DOCX):** We already have `content_html` from mammoth (headings, bold, etc.). The workspace can show it when present; the issue is that we treat the whole script as one blob (no page split) and we may not be preserving/sending HTML per page.
- **PDF:** We only extract plain text per page (no bold/italic from PDF.js `getTextContent()`). To get formatting we’d need font/style info (e.g. bold font name) and map it to HTML/CSS — doable but more work.

**Doable:**

| Source | Formatting | Approach |
|--------|------------|----------|
| **DOCX** | Yes | Keep using mammoth HTML; when we add pages, split or associate that HTML with pages (e.g. by paragraph or by explicit page breaks if we can detect them). |
| **PDF** | Partial | We can preserve **structure** (paragraphs, lines) per page and optionally infer **style** from font names (e.g. “Bold” in font name → `<strong>`). Full WYSIWYG is harder. |

**Recommendation:**  
- Phase 1: Preserve and display existing **DOCX HTML** in the new page-based model (per-page or whole-doc HTML that we render per page).  
- Phase 2: For PDF, at least preserve paragraph/line breaks per page; optional: infer basic bold/heading from font info.

---

## 3. Pages (one page in doc = one page in workspace)

**Goal:**  
Each page in the workspace corresponds to one page in the source (PDF or Word). Content of page N in the app = content of page N in the file. This enables “finding on page X” later.

**Current state:**

- **Storage:** `script_text` has one `content` and one `content_html` per version (no page concept). `script_sections` has sections with offsets (not page-based).
- **PDF extraction:** We already get text **per page** in `documentExtract.ts` (loop over `numPages`, `getTextContent()` per page), but we **join** all pages into one string and send that to `/extract`. So we have the data to keep pages but we don’t persist them separately.
- **Word:** Pagination is layout-dependent (font, size, margins). We can approximate pages (e.g. by page break nodes in the DOCX or by character-count heuristics).

**Doable:**

| Step | Doable? | Notes |
|------|--------|--------|
| **Data model: store per-page content** | Yes | New table or structure, e.g. `script_pages` (version_id, page_number, content, content_html), or a single JSONB “pages” array on `script_text`. |
| **PDF: send/store per page** | Yes | Change client to send `pages: [{ pageNumber: 1, text: "..." }, ...]` and change `/extract` (or ingest) to store per page instead of one concatenated text. Canonical “full” content can remain the concatenation for analysis/offsets if needed. |
| **Word: derive pages** | Yes | Use mammoth’s structure (e.g. page breaks) or a simple rule (e.g. N paragraphs or M characters per page) to build a list of “pages” and store them. |
| **Analysis/offsets** | Yes | Either keep global offsets (current) and **map offset → page** (e.g. by cumulative per-page length), or store per-page offsets and report “page + offset on page”. Both doable. |

**Recommendation:**  
- Introduce a **page-aware storage** (e.g. `script_pages` with version_id, page_number, content, content_html).  
- **PDF:** Extract and send per-page text (and later per-page HTML if we add it); backend stores one row per page.  
- **Word:** Generate pages from existing HTML (e.g. split by page-break or by size) and store the same way.  
- Keep a **single canonical full text** (concatenation of pages) for the current analysis pipeline until we decide to move to page-scoped analysis; then we can add “page” to findings.

---

## 4. Workspace: page view + toolbar (like image 3)

**Goal:**  
Workspace shows one (or a few) pages at a time, with a toolbar: current page indicator (e.g. “2 / 472”), prev/next, zoom in/out.

**Doable:**

| Piece | Doable? | Notes |
|-------|--------|--------|
| **Page state** | Yes | `currentPage: number`, `totalPages: number` (from stored pages). |
| **Render current page** | Yes | Load `content` / `content_html` for `currentPage` and render in the existing editor area (same RTL, same font and dir). |
| **Toolbar** | Yes | Bar with: “Page 2 / 472”, Previous, Next, Zoom out, “110%”, Zoom in (and optionally fit width, etc.). |
| **Zoom** | Yes | CSS transform or font-size on the container (e.g. `transform: scale(zoomLevel)` or `font-size: 100% * zoomLevel`). |
| **Highlights/findings** | Yes | When showing page N, only render highlights that fall on page N (using offset → page mapping). |

**Recommendation:**  
- Add a **page-aware workspace**: state (currentPage, zoom), load and render only the current page’s content (and optionally adjacent for snappier prev/next).  
- Reuse existing editor div and highlight logic, but **scope** offsets to the current page’s content so we only show marks for that page.  
- Add a **toolbar** component (page nav + zoom) above or beside the viewer.

---

## 5. Phased implementation plan

### Phase 1 — Quick wins (no schema change)

1. **Arabic display:**  
   - In the workspace script viewer, set a font that supports Arabic joining (e.g. `font-family: 'Amiri', 'Noto Naskh Arabic', serif;` or similar).  
   - Ensure the container has `dir="rtl"` and `lang="ar"` (already in place).  
   - Optional: when extracting PDF, try to keep or convert to logical-order Unicode if we can.

2. **Formatting (DOCX):**  
   - Ensure we never overwrite or drop `content_html` when we have it; keep showing it in the single-page long view until Phase 2.

### Phase 2 — Page storage and extraction

1. **Schema:**  
   - Add `script_pages` (or equivalent): `version_id`, `page_number`, `content`, `content_html` (nullable).  
   - Optionally keep `script_text.content` as the concatenation of all pages for backward compatibility with analysis (global offsets).

2. **PDF:**  
   - Client: extract text (and later HTML) **per page**; send to backend as array of pages.  
   - Backend: accept `pages: Array<{ pageNumber, text, html? }>`, write rows into `script_pages`, and still build full `content` for analysis if needed.

3. **Word:**  
   - Either split existing `content_html` into page chunks (by page-break or heuristic), or add a simple “virtual pages” (e.g. every N characters) and store in `script_pages`.  
   - Prefer real page breaks from mammoth if available.

4. **API:**  
   - GET editor (or a new GET script pages) returns `pages: [{ pageNumber, content, content_html }]` plus optional full content for backward compatibility.

### Phase 3 — Page-based workspace UI

1. **State:**  
   - `currentPage`, `totalPages`, `zoomLevel` (e.g. 1.0 = 100%).

2. **Toolbar:**  
   - Page: “2 / 472”, Prev, Next.  
   - Zoom: −, “110%”, +.  
   - (Optional) Fit width, Fit page.

3. **Viewer:**  
   - Fetch/render only the current page’s content (and maybe preload current ± 1).  
   - Apply zoom (CSS transform or font-size).  
   - Map finding offsets to page and show highlights only on the current page.

4. **Reports later:**  
   - When we store findings, add `page_number` (and optionally offset-in-page).  
   - Report UI can show “Page 12” (and link to open workspace at page 12).

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| **Analysis pipeline assumes one contiguous content** | Keep full concatenated content for analysis in Phase 2; map offsets to page after the fact. When we add “page” to findings, we can still use global offsets and derive page from cumulative page lengths. |
| **Word “page” is ambiguous** | Use explicit page breaks from DOCX when possible; otherwise define a simple rule (e.g. 3000 chars per page) and document it. |
| **PDF formatting limited** | Accept “structure + optional bold” from font info; don’t promise full WYSIWYG for PDF. |
| **Arabic still disconnected for some PDFs** | Font + dir + lang first; then consider logical-order conversion or a different PDF text extractor for problem files. |

---

## 7. Adapting the system without breaking anything

This section spells out how to introduce pages and formatting **without changing** the existing analysis contract, and what (if anything) to add so the pipeline and reports work with the new features.

### 7.1 What the analysis pipeline depends on today

| Consumer | What it uses | Contract |
|----------|--------------|----------|
| **POST /tasks** (create job) | `script_text.content`, `script_text.content_hash` | Single normalized full text; hash for "script changed" check. |
| **Chunking** | `script_text.content` → `chunkText(normalized, 12_000, 800)` | Chunks have `start_offset`, `end_offset` into that **full content**. |
| **Worker** | Chunk `text`, `start_offset`, `end_offset` | Returns `location.start_offset` / `end_offset` **within chunk**; pipeline adds chunk offset → `start_offset_global`, `end_offset_global`. |
| **analysis_findings** | `start_offset_global`, `end_offset_global` | All offsets are **global** into the same single content. |
| **Findings API (evidence snippet)** | `script_text.content` + `start_offset_global` / `end_offset_global` | `content.slice(start, end)` for display/evidence. |
| **Script workspace (highlights)** | `script_text.content` (or `content_html`) + finding offsets | Highlights are drawn at global offsets in the one long view. |

The **invariant** to preserve: one canonical string (`script_text.content`) and every finding refers to it by global character offsets. Nothing in the pipeline today knows about "pages".

### 7.2 Strategy: keep one canonical content; add pages as a view

- **Keep `script_text` as the single source of truth for analysis.**  
  - `script_text.content` = one contiguous normalized text (same as today).  
  - When we have **pages**, define it as: `content = pages[1].content + SEP + pages[2].content + ...` with a **fixed separator** (e.g. `"\n\n"`). Same document → same `content` and `content_hash`.  
- **Add `script_pages` for display and "page of finding".**  
  - Store per-page content (and optional HTML) for the workspace viewer and for mapping offset → page.  
  - Do **not** make the worker or tasks read from `script_pages`; they keep using `script_text.content` only.

Result: **no change** to tasks, worker, or findings storage logic. Analysis continues to run on the same full text; chunks and global offsets stay valid.

### 7.3 Backward compatibility

| Scenario | Behaviour |
|----------|-----------|
| **Old scripts (no pages)** | No rows in `script_pages`. Workspace shows one long page (current behaviour). GET editor returns `content`, `contentHtml`, `sections`; no `pages` or empty `pages`. |
| **New import (PDF/Word with pages)** | Extract writes `script_pages` **and** builds `script_text.content` from pages (concatenation). Code that only reads `script_text` sees no change. |
| **Re-import same document** | Same separator and page order → same `content` and `content_hash` → no spurious "script changed" or duplicate analysis. |

We add a parallel structure (pages) and one deterministic way to derive `script_text.content` from pages. We do **not** remove or replace the existing content column.

### 7.4 What to add for "finding on page X" and reports

- **Offset → page mapping**  
  - When we have `script_pages`, store per page a cumulative `start_offset_global` (e.g. page 1: 0, page 2: length(page1)+sep, …).  
  - Given a finding's `start_offset_global`, compute page number by which page range contains that offset. Expose in the API (e.g. page boundaries or `pageNumberForOffset(versionId, offset)`).

- **Optional: store `page_number` on findings**  
  - Add nullable `page_number` to `analysis_findings`. When we **insert** a finding (worker or manual), if we have page boundaries for that version, set `page_number` once.  
  - **Enhancement:** In the worker (or in the Edge function that writes findings), after computing `start_offset_global` / `end_offset_global`, compute page and set `finding.page_number`. Same for manual finding creation.  
  - Old findings leave `page_number` null; report can derive page from offset when boundaries exist, or show no page.

- **Report and workspace enhancements**  
  - Report template: show "Page X" next to each finding when `page_number` is set (or derivable from offset).  
  - Workspace: "Go to page of this finding" from the findings sidebar by setting current page to `finding.page_number`.

No change to **how** analysis runs (chunking, AI, evidence_snippet, global offsets). Only additive: optional column + derivation and display.

### 7.5 Analysis pipeline: what to change vs what to leave as-is

| Component | Change? | What to do |
|-----------|--------|------------|
| **POST /tasks** | No | Keeps reading `script_text.content` and `content_hash`; chunks same as today. |
| **Worker (chunk processing)** | No | Still receives chunk text and offsets; still returns local offsets; pipeline still converts to global. |
| **analysis_chunks** | No | Still `start_offset` / `end_offset` into full content. |
| **analysis_findings** | Optional additive | Add nullable `page_number`; set it on insert when we have page boundaries (worker + manual). |
| **Extract / script_text write** | Yes (Phase 2) | When request includes `pages[]`, write `script_pages` and set `script_text.content` = concatenation of page contents (fixed separator). Still set `content_hash` from that content. |
| **GET editor (or GET script pages)** | Yes (Phase 2) | Return `pages` when present (e.g. `[{ pageNumber, content, contentHtml, startOffsetGlobal? }]`). Optionally return `pageBoundaries` for offset→page. |
| **Findings API (evidence snippet)** | No | Still uses `script_text.content` and global offsets. Snippet stays correct. |
| **Workspace (highlights)** | Phase 3 | When in page view, show highlights only for the current page (filter by `page_number` or offset-in-page range). |

The only **required** pipeline change is in **extract + editor API**: accept and store pages, and always persist the same single `script_text.content` (and hash) derived from those pages. The rest is optional (page_number on findings, report/workspace UI).

### 7.6 Summary: safe adoption path

1. **Introduce `script_pages`** and write it from extract when we have per-page input; always keep **`script_text.content`** as the concatenation of pages (fixed separator). No change to tasks or worker.  
2. **Expose pages in the API** for the workspace and, if useful, page boundaries for offset→page.  
3. **Optionally** add `page_number` to findings and set it on insert when page boundaries exist; enhance reports and workspace to show and link to "Page X".  
4. **Keep evidence_snippet and global offsets** as they are; they remain correct because they still refer to `script_text.content`.

This way the system gains pages and "finding on page X" without breaking existing analysis or reports.

---

## 8. Summary

| Goal | Doable? | Suggested phase |
|------|--------|------------------|
| Arabic letters connected | Yes | Phase 1 (font + dir/lang); optionally Phase 2 (logical-order extraction). |
| Formatting preserved | Yes for DOCX; partial for PDF | Phase 1 preserve HTML; Phase 2 per-page HTML; PDF structure/bold later. |
| Script split by pages | Yes | Phase 2 (schema + PDF/Word extraction + API). |
| Page-based view + toolbar | Yes | Phase 3 (UI: page nav, zoom, render current page). |
| “Finding on page X” in report | Yes | After Phase 2/3: store or derive page per finding; show in report and link to workspace page. |

This plan is **doable** and can be implemented in the three phases above. Next step is to agree on Phase 1 (Arabic font + any quick formatting check) and then Phase 2 schema and API design (e.g. exact columns for `script_pages` and the shape of the editor/pages API).
