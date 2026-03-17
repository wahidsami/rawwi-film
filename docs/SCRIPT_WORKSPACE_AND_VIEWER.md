# Script workspace: import, pages, viewer, and findings

This document describes how the **script workspace** works end-to-end: importing documents, how they become **pages**, what the **viewer** actually shows, and how **finding cards** relate to analysis and on-screen highlights.

---

## 1. What the script workspace is

The **script workspace** is the screen where a reviewer:

- Sees the script text (one page at a time or as a long scroll, depending on data).
- Runs **Smart Analysis**, opens **reports**, and reviews **findings**.
- Can **replace** the file (new version), generate reports, and mark decisions.

It loads editor data from the API (`GET` editor for `scriptId` + `versionId`). That payload may include:

- **`content`** / **`contentHtml`** — full-document plain text and optional HTML (legacy / single-blob scripts).
- **`pages`** — an array of per-page slices when the version was imported **with pagination** (see below).

If **`pages.length > 0`**, the UI switches to **page mode** (PDF-like viewer). Otherwise it uses **scroll mode** (single formatted or plain block).

---

## 2. How imported documents are processed

### 2.1 Upload flow (high level)

1. User picks a file (**TXT**, **DOCX**, or **PDF**).
2. App uploads to storage and calls **`createVersion`** on the script (new `script_version` row).
3. App extracts text **in the browser** (except TXT, which is read as text).
4. App calls **`extractText`** on the Edge **`/extract`** (or equivalent) with either:
   - a single string, or  
   - a **`pages`** array: `{ pageNumber, text, html? }[]`.

The extract function persists:

- **`script_text`** — canonical plain text for analysis (and usually HTML for DOCX).
- **`script_pages`** (when `pages` are sent) — one row per page: `content`, optional `content_html`.
- Sections, etc., as implemented in `supabase/functions/extract/index.ts`.

Analysis jobs always run against the **canonical** string in **`script_text.content`** (normalized, with a fixed separator between pages — see §3).

### 2.2 TXT

- Content is the file text as UTF-8 (after NFC normalization on the server).
- Typically **no** `script_pages` → **scroll mode** in the workspace.

### 2.3 PDF

- **Client:** `extractTextFromPdfPerPage` (PDF.js) reads **each PDF page** and produces `{ pageNumber, text, html? }`.
- **Server:** Pages are stored in **`script_pages`**.  
- **`script_text.content`** is the concatenation of page texts joined by **`\\n\\n`** (two newlines). That separator is part of the **global offset** space used by findings.

**Viewer:** Page *N* in the app corresponds to PDF page *N* when pagination is used.

### 2.4 DOCX

- **Client:** `extractDocxWithPages` uses Mammoth for **plain + HTML**.
- **Page splits:**
  - If the Word file has **explicit page breaks** (OOXML), the client splits into **real** pages → workspace pages match Word pages.
  - If there are **no** page breaks (or only one virtual page), the client may send a **single** blob (no multi-page array) or split by **heuristic** (e.g. approximate character count per page) — see `documentExtract.ts` and `PLAN_SCRIPT_PAGES_AND_FORMATTING.md`.

When **multiple** DOCX pages are sent, each page can carry **`content_html`** for a **formatted** viewer on that page.

---

## 3. Canonical text, offsets, and “page 1”

- **`script_text.content`** is the **single source of truth** for:
  - AI analysis chunks,
  - **`start_offset_global` / `end_offset_global`** on findings,
  - mapping offset → page for **`page_number`** on findings.

- With **`script_pages`**, canonical content = page1 + `\\n\\n` + page2 + `\\n\\n` + …

Details: **`docs/OFFSETS_AND_PAGES.md`**.

**Viewer page for highlights (UI):** The workspace recomputes which **viewer page** a finding belongs to from **`start_offset_global`** and the same page-boundary rule as storage: cumulative `page.content.length + 2` between pages. Highlights on page *N* only include findings whose **offset falls in that page’s global range**, not only `finding.page_number` from the DB (which can disagree after DOCX heuristics, etc.). If offsets are missing, it falls back to DB `page_number` or text visible on the current page.

**Evidence-first highlight:** For each finding, the app first looks for an **exact** `evidence_snippet` (ordered needles, dialogue tail first) **inside the global offset window** `[start,end]` in canonical `script_text.content`, preferring the **last** match in that window—then maps that span to the current page. That tightens highlights to the quoted line instead of a wide speaker+dialogue block. Wider search is only used if the window match does not land on the visible page.

**Viewer page on cards:** Report/workspace finding cards prefer **page derived from `start_offset_global` + `script_pages`** (same rule as highlights). Results page loads editor pages to label findings. **Page-local offsets** (`start_offset_page` / `end_offset_page`) on `analysis_findings` tighten highlights on the extracted page text when present (worker fills on new analyses).

**DOCX without Word page breaks:** If the file has **no** OOXML page breaks, pages may split on **scene headings** (`المشهد …`, `INT.`, `EXT.`, etc.) before falling back to size-based chunks. Prefer inserting **page breaks in Word** for exact pagination. On upload, a **console warning** logs if joined page text does not match full plain (slice bug signal).

**PDF originals:** For PDF imports, the editor response may include **`sourcePdfSignedUrl`** (short-lived). The workspace offers **Original PDF** vs **Extracted text**; highlights apply only on extracted text.

**Chunk-by-page analysis:** Set Edge env **`ANALYSIS_CHUNK_BY_PAGE=true`** so analysis chunks follow script pages (see [OFFSETS_AND_PAGES.md](./OFFSETS_AND_PAGES.md)).

**Important:** The **card** may show **“صفحة 1”** from the **analysis pipeline** (offset → page). The **workspace** also shows **“page 1 / N”** from **stored slices**. Those align when:

- PDF: same page index.  
- DOCX with real breaks: usually aligned.  
- DOCX/PDF with different heuristics or post-import edits: **numbers can diverge**; highlights then rely more on **text search** (`evidence_snippet`) than on raw offsets.

---

## 4. Nature of the script viewer

### 4.1 Page mode (`pages.length > 0`)

- One **“sheet”** per screen showing **only the current page’s** `content` / `content_html`.
- Toolbar: **previous / next page**, **zoom** (CSS transform).
- **RTL** and Arabic-friendly font; DOCX pages can render **sanitized HTML** inside the page container.
- The DOM for formatted pages is filled via **`innerHTML`** in a **layout effect** so React does not constantly wipe **highlight** spans.

**Plain text per page** is what the UI uses to:

- Match **evidence** strings to positions,
- Build a **DOM text index** for wrapping ranges in `<span data-finding-id="…">`.

### 4.2 Scroll mode (no `pages`)

- Entire **`contentHtml`** or plain **`content`** in one scrollable area.
- Same highlighting ideas, but ranges are **global** within the full document string.

### 4.3 What the viewer is *not*

- It is **not** a live collaborative Word editor; it is a **read-oriented** script viewer (selection can feed manual findings / context menu flows).
- **PDF** pages are **text extracted** into HTML/plain — not a pixel-perfect PDF renderer (unless you add one later).

---

## 5. Finding cards after analysis — expected behaviour

### 5.1 Where findings come from

After **Smart Analysis**, findings are stored (e.g. **`analysis_findings`**) with fields such as:

- **`evidence_snippet`** — quote or paraphrase shown on the card,
- **`start_offset_global` / `end_offset_global`** — span in **canonical** `script_text.content`,
- **`page_number`** — derived from offsets + `script_pages` (when available),
- article / atom / severity / source, etc.

The workspace can load:

- **All job findings** (sidebar list), and/or  
- **Report-scoped** findings when a report is selected for **“report highlighting”**.

### 5.2 What a finding card should do

| Behaviour | Intent |
|-----------|--------|
| Show **severity**, **source** (AI / lexicon / manual), **article/atom**, **page** | Quick triage. |
| Show **evidence** text | Matches what the model flagged in the script. |
| **Click** card | Scroll/flashes the matching span in the viewer **when** a reliable map exists. |
| **Highlights** on the page | Optional overlay of all (or report) findings on the **current** page text. |

### 5.3 Why highlights sometimes look “wrong” or missing

1. **Text changed** after analysis → content hash mismatch; app may fall back to **searching** by evidence (best effort).
2. **DB `page_number`** vs **viewer page**: a finding may be attributed to “page 1” in metadata while the **same phrase** sits on another **viewer** page if splits differ.
3. **Evidence** is only the **dialogue** line but stored offsets cover **speaker + dialogue** — the UI tries to **shrink** highlights toward the evidence string (after `:` / sentence fragments).
4. **Overlap**: two findings in the same range may share one visible span or skip one mark depending on sort/overlap rules.
5. **Plain vs HTML**: matching uses **plain text** extracted from the DOM; tiny differences (spaces, punctuation, RTL marks) can prevent a match.

So: **cards are authoritative for “what was flagged”; the viewer highlight is a best-effort map** from evidence + offsets to the current DOM.

---

## 6. Related docs

| Doc | Topic |
|-----|--------|
| `docs/OFFSETS_AND_PAGES.md` | Canonical content, `\\n\\n` separator, offset → page |
| `docs/PLAN_SCRIPT_PAGES_AND_FORMATTING.md` | Pagination plan, Arabic, formatting |
| `docs/AGENT_01_ANALYSIS_PIPELINE.md` | How analysis jobs use script text (if present) |
| `apps/web/src/utils/documentExtract.ts` | DOCX/PDF extraction implementation |
| `supabase/functions/extract/index.ts` | Persisting `script_text` + `script_pages` |

---

## 7. Summary diagram (mental model)

```
[User uploads PDF/DOCX/TXT]
        ↓
[Browser extract → pages or single text]
        ↓
[extract API → script_text.content + optional script_pages[]]
        ↓
[Analysis reads script_text.content → findings with offsets + page_number]
        ↓
[Workspace loads editor: pages[] or single content]
        ↓
[Viewer: page mode OR scroll mode]
        ↓
[Finding cards: evidence + page; highlights = map(evidence, offsets) → DOM spans]
```

This file is descriptive of **current design and behaviour**; implementation details may evolve — check the referenced code paths when debugging.
