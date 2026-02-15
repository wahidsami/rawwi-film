# Editor Highlights and Manual Findings Audit (RaawiFilm)

**Purpose:** Document the current implementation of script editor highlighting, finding tooltips, and the manual-finding flow so UX can be aligned with: word-wrapped editor, AI findings as red spans, hover tooltips, and “Add to findings” (report + article/atom/severity/comment) with persistence.

---

## 1. Current editor implementation

### What is used

- **Not** a rich-text editor (no TipTap, Slate, Quill). The script content is rendered in a **plain read-only `<div>`** with no `<textarea>` and no contenteditable used for typing.

### File path

- **`apps/web/src/pages/ScriptWorkspace.tsx`**

### Implementation details

- **Container:** A single `<div>` (ref `editorRef`) that holds the script text and highlight spans.
- **Location in file:** ~lines 841–883 (inside the “Center: Read-only viewer” column).
- **Key attributes:**
  - `ref={editorRef}` — used for selection/offset calculation and scroll.
  - `className`: includes `... whitespace-pre-wrap text-right ... min-h-[600px] ... outline-none ... break-words`
  - `dir="rtl"` for Arabic.
  - `role="region"`, `aria-label` for accessibility.
  - `onContextMenu={handleContextMenu}`, `onMouseUp={handleMouseUp}`, `onTouchEnd` for selection and context menu.

- **Content source:** `displayContent` = `editorData?.content ?? extractedText` (from GET /scripts/editor or upload fallback). Rendered in one of two ways:
  1. **When `reportFindings.length > 0`:** Content is split into **finding segments** (see below); each segment is a `<span>` — either plain text or a highlighted span with `data-finding-id`, hover handlers, and click-to-focus in sidebar.
  2. **Otherwise:** Content is rendered via `dangerouslySetInnerHTML={{ __html: viewerHtml }}`. `viewerHtml` = `insertSectionMarkers(getHighlightedText(), sections)` where `getHighlightedText()` uses **scriptFindings** (legacy) to inject `<span>` highlights into HTML.

- **Word wrap:** Yes — `whitespace-pre-wrap` and `break-words` give word-wrapped display while preserving newlines.

- **Summary:** Plain `<div>`, read-only, word-wrapped; no toolbar; highlights come from either segment-based rendering (report findings) or HTML string (legacy script findings).

---

## 2. Highlight spans logic (offset-based and HTML)

### Two highlight paths

| Path | Data source | When used | How |
|------|-------------|-----------|-----|
| **A. Segment-based** | `reportFindings` (AnalysisFinding[]) | When user has selected a report for highlights (`reportFindings.length > 0`) | `buildFindingSegments(displayContent, reportFindings)` → array of `{ start, end, finding }`. Each segment rendered as `<span>`; segments with a finding get highlight classes and hover/click. |
| **B. HTML injection** | `scriptFindings` (Finding[] from dataStore) | When no report is selected for highlights | `getHighlightedText()` builds an HTML string: for each finding, replaces the evidence span in `displayContent` with `<span id="highlight-..." class="...">...</span>`. Then `insertSectionMarkers(html, sections)` injects section anchors. Result set via `dangerouslySetInnerHTML`. |

### Path A: Segment-based (report findings)

- **Function:** `buildFindingSegments(content: string, findings: AnalysisFinding[]): Segment[]`  
  **Location:** ScriptWorkspace.tsx ~lines 562–602.

- **Logic:**
  - Filter findings to those with valid `startOffsetGlobal` / `endOffsetGlobal` (within content length).
  - Sort by priority: violations before approved, then by severity (critical > high > medium > low), then by start offset.
  - Build a “winner” array (one finding per character index); overlapping ranges: violation overrides approved, higher severity over lower.
  - Scan the winner array to produce contiguous segments `{ start, end, finding }` (finding can be null for unhighlighted text).

- **Rendering:** ~lines 843–878. For each segment, if `seg.finding` is set, render a `<span>` with:
  - `data-finding-id={seg.finding.id}`
  - Classes: `bg-success/20 border-success/50` for approved, `bg-error/20 border-error/50` for violation.
  - `onMouseEnter` → set `tooltipFinding` and `tooltipPos`.
  - `onMouseLeave` → clear `tooltipFinding`.
  - `onClick` → set `selectedFindingId`, switch sidebar to “findings” tab (scrolls to finding card).
  - Section markers (`data-section-index`, `id="section-{index}"`) are emitted when a segment starts at a section’s `startOffset`.

- **Offset basis:** All offsets are **character offsets** into the **plain** `displayContent` string (same as `script_text.content` / normalized script text). No regex; strictly start/end indices.

### Path B: HTML injection (script findings)

- **Function:** `getHighlightedText()`  
  **Location:** ScriptWorkspace.tsx ~lines 605–628.

- **Logic:**
  - Start with `displayContent`.
  - Sort `scriptFindings` by `startOffsetGlobal` descending (so replacements don’t shift indices).
  - For each finding with `evidenceSnippet`: if it has valid offsets, replace `content.substring(startOffsetGlobal, endOffsetGlobal)` with a `<span>` (id, data-anchor, classes, title with articleId). Else fallback to `html.replace(evidenceSnippet, replacement)` (first occurrence).
  - Returns an HTML string; section markers are then inserted by `insertSectionMarkers`.

- **Where used:** Only when **no** report is selected for highlights. Then the center content is `viewerHtml` (path B). In production, GET /findings returns `[]`, so `scriptFindings` is usually empty and path B shows no highlights until a report is selected (which switches to path A).

### Section markers

- **Function:** `insertSectionMarkers(html: string, sections: EditorSectionResponse[]): string`  
  **Location:** ScriptWorkspace.tsx ~lines 633–658.

- **Purpose:** Insert `<span id="section-{index}" data-section-index="{index}">` at character positions that match section `startOffset`, so the sidebar can scroll to “Section N”. When walking the HTML string, content inside tags is skipped so that “content character position” matches the plain-text offsets.

---

## 3. Findings schema: where AI findings live and location fields

### Table: `analysis_findings`

- **Defined in:** `supabase/migrations/0003_phase1a.sql` (base), plus `0006_finding_review.sql`, `0009_manual_finding.sql`.

**Key columns:**

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| job_id | uuid | FK → analysis_jobs. **All findings (AI + manual) are tied to a job.** |
| script_id | uuid | Script |
| version_id | uuid | Script version (same version as the job) |
| source | text | `'ai' \| 'lexicon_mandatory' \| 'manual'` |
| article_id | int | Article number (e.g. 1–25) |
| atom_id | text | Optional sub-article id |
| severity | text | low, medium, high, critical |
| confidence | numeric | AI confidence (e.g. 1 for manual) |
| title_ar | text | Short title (e.g. "ملاحظة يدوية" for manual) |
| description_ar | text | Description / comment |
| evidence_snippet | text | Exact text span (or derived from content slice) |
| **start_offset_global** | int | **Start character offset in version’s normalized content** |
| **end_offset_global** | int | **End character offset** |
| start_line_chunk | int | Chunk line (for AI chunks) |
| end_line_chunk | int | Chunk line |
| location | jsonb | Extra location metadata |
| evidence_hash | text | Dedup key (manual uses "manual-" + uuid) |
| created_at | timestamptz | |
| review_status | text | 'violation' \| 'approved' (0006) |
| review_reason | text | |
| reviewed_by | uuid | |
| reviewed_at | timestamptz | |
| reviewed_role | text | |
| created_by | uuid | Set for manual (0009) |
| manual_comment | text | Optional comment for manual (0009) |

**Location for highlighting:** Offsets used in the editor are **start_offset_global** and **end_offset_global** — character offsets into the **normalized** script text (same as `script_text.content` for that version). Evidence text is stored in **evidence_snippet** (and recomputed for manual from `script_text.content.slice(start, end)` in the Edge Function).

---

## 4. Report linkage: how findings connect to reports

- **Reports:** `analysis_reports` has one row per analysis job: `job_id` UNIQUE → `analysis_jobs(id)`. So **report ↔ job** is 1:1.
- **Findings:** `analysis_findings.job_id` → `analysis_jobs(id)`. So **findings ↔ job** is N:1.
- **Indirect link:** Findings do **not** have a `report_id` column. They link to a report only via **job_id** (report.job_id = job.id, findings.job_id = job.id).

**Flow:**

1. User runs analysis → POST /tasks → creates `analysis_jobs` row and `analysis_chunks`. When the worker completes, it (or another process) creates an `analysis_reports` row with the same `job_id`.
2. AI findings are inserted into `analysis_findings` with that `job_id`.
3. Manual finding: user picks a **report** in the UI; frontend sends `reportId`. Backend resolves report → `job_id`, then inserts the new finding with that `job_id`. So the manual finding is attached to the **same job (and thus the same report)** as the selected report.
4. To show “findings for this report,” the app calls GET /findings?reportId=… (backend resolves report → job_id, then returns findings for that job).

**Summary:** Linkage is **job_id**. Report is the user-facing handle; backend maps reportId → job_id for both GET findings and POST manual.

---

## 5. Existing UI: context menu and manual-finding modal

### Context menu (right-click / selection)

- **Location:** ScriptWorkspace.tsx ~lines 1152–1168.
- **Trigger:** Right-click with text selected → `handleContextMenu` sets `contextMenu` to `{ x, y, text, startOffsetGlobal?, endOffsetGlobal? }`. Offsets come from `getSelectionOffsets(editorRef)` (DOM selection → character offsets in the div’s text).
- **Floating action (touch):** On mouseup/touchend with selection and no context menu, a floating button appears at the selection; clicking it opens the same context menu state.
- **Menu content:**
  - **“Mark as Violation”** (تسجيل كمخالفة): calls `handleMarkViolation()` → sets `manualOffsets` from context menu offsets (or from `displayContent.indexOf(text)` if offsets missing), opens the manual-finding modal, pre-fills excerpt and default report.
  - **“Add Note”** (إضافة ملاحظة): currently only a button; no handler (no-op).

### Manual-finding modal (“Mark as Violation”)

- **Location:** ScriptWorkspace.tsx ~lines 1170–1233.
- **Title:** “Mark as Violation” / “تسجيل ملاحظة يدوية”.
- **Content:**
  - **Excerpt:** Selected text in a styled quote box (`formData.excerpt`).
  - **Report dropdown:** `<Select>` with `reportHistory.map(r => ({ label: date + findings count, value: r.id }))`. Required; if no reports, message “Run analysis first to create a report.”
  - **Article dropdown:** `<Select>` with `ARTICLES_CHECKLIST` (25 items: Art 1–Art 25 with Arabic titles). Value: `formData.articleId` (string, e.g. "1").
  - **Atom (optional):** Free-text `<input>` placeholder “e.g. 17 or 4.17”, `formData.atomId`. Not dependent on article in UI (single list for articles).
  - **Severity:** `<Select>` low / medium / high / critical.
  - **Comment:** `<Textarea>` for explanation, `formData.comment`.
  - **Actions:** Cancel, and “Save Finding” (حفظ الملاحظة) with `variant="danger"`; disabled when no report or no report history.

- **Save flow:** `saveManualFinding()`:
  - Validates script, currentVersionId, formData.reportId, manualOffsets.
  - Calls `findingsApi.createManual({ reportId, scriptId, versionId, startOffsetGlobal, endOffsetGlobal, articleId: parseInt(formData.articleId, 10) || 1, atomId, severity, manualComment })`.
  - On success: refetches findings for that job, sets `reportFindings`, ensures `selectedReportForHighlights` is the report just used (so the new finding appears in the editor), sets `selectedFindingId` to the created finding, switches sidebar to “findings” tab.

- **Gap vs desired UX:** The modal already has Report, Article, Atom (optional), Severity, and Comment. The only behavioral gap is “Add to findings” vs “Mark as Violation” wording if we want a neutral “Add to findings” entry point; the backend and schema already support manual findings attached to a chosen report.

---

## 6. APIs / Edge Functions for findings; manual in schema

### Findings Edge Function

- **File:** `supabase/functions/findings/index.ts`
- **Routes:**
  - **GET /findings?jobId=…** or **GET /findings?reportId=…**  
    Resolves reportId → job_id if needed; returns findings for that job (with review_status, etc.). No query params → returns `[]`.
  - **POST /findings/review**  
    Body: `{ findingId, toStatus: 'approved'|'violation', reason }`. Updates finding review fields and recomputes report aggregates.
  - **POST /findings/manual**  
    Body: `{ reportId, scriptId, versionId, startOffsetGlobal, endOffsetGlobal, articleId, atomId?, severity, manualComment? }`. Validates report belongs to script; loads `script_text.content` for version; slices evidence_snippet from content; inserts into `analysis_findings` with source `'manual'`, then recomputes report aggregates. Returns the new finding (camelCase).

### Manual findings in schema

- **Yes.** Manual findings are stored in the **same** `analysis_findings` table with `source = 'manual'`. They have `created_by` and `manual_comment` (0009). They use the same `job_id` (derived from the selected report) and the same offset/evidence fields, so they appear in the same report and in the same highlight view as AI findings.

### Frontend API

- **findingsApi.getByJob(jobId)** → GET /findings?jobId=…
- **findingsApi.getByReport(reportId)** → GET /findings?reportId=…
- **findingsApi.createManual(body)** → POST /findings/manual  
  Body: CreateManualFindingBody (reportId, scriptId, versionId, startOffsetGlobal, endOffsetGlobal, articleId, atomId?, severity, manualComment?).

---

## 7. Gaps vs desired UX and recommendations

### Desired UX (short)

- Imported script in a word-wrapped editor.
- AI findings show as red (violation) highlights on exact spans.
- Hover on highlight → tooltip with same content as finding card.
- Select text → right-click → “Add to findings” → modal: Article, Atom (per article), Severity, Comment, Report → Save → manual finding in selected report and persisted.

### Current state vs desired

| Aspect | Current | Gap |
|--------|---------|-----|
| Editor | Plain read-only div, word-wrapped | Matches “word-wrapped editor”; no rich editing. |
| AI highlights | Shown when a report is selected; segment-based spans with red/green by review status | Matches “exact spans” and “red” for violations; approved are green. |
| Tooltip on hover | Implemented: fixed div with Art X, severity, descriptionAr/evidenceSnippet, Safe/Violation badge | Matches “tooltip with same content as finding card.” |
| “Add to findings” | Context menu “Mark as Violation” opens modal; “Add Note” does nothing | Wording: “Add to findings” vs “Mark as Violation”; “Add Note” could open same modal or a note-only flow. |
| Report dropdown | Yes, required; list from reportHistory | Matches. |
| Article dropdown | Yes, single list (25 articles) | Matches; atom is optional free text (not strictly “atom depends on article” but acceptable). |
| Severity & Comment | Yes | Matches. |
| Manual finding in report | Persisted to analysis_findings with report’s job_id; refetch shows in highlights | Matches. |
| Highlights when no report selected | Uses scriptFindings (GET /findings no params → []) | In production, no highlights until user selects a report. So “highlights for the current report” are correct; “show all findings for script” would need a different loading strategy. |

### Offset strategy

- **Keep current approach:** All highlights and manual findings use **character offsets** into the **single normalized plain-text** content (`script_text.content` = `displayContent`). No regex; all logic is start/end index based. This stays correct as long as:
  - The editor’s “analysis content” remains this same plain string (e.g. if we add rich text, we still derive a plain version for analysis and offsets).
  - We do not change normalization (e.g. NFC, whitespace collapse) without migrating offsets or recomputing.

### Editor library choice

- For **highlighting and tooltips only**, the current div + segment spans is sufficient and already works.
- If we add **editable** rich text later, we should keep a **plain-text mirror** for offsets and use an editor that either:
  - Exposes a “plain” getText() and we keep storing that in `script_text.content`, or
  - We map offsets from the rich model to the plain export so findings still align. Recommendation: keep storing one canonical plain text for analysis and offsets; rich format optional for display only (see script-import-and-editor-audit.md).

### Tooltip implementation

- **Current:** When `findingSegments` is used, each highlighted `<span>` has `onMouseEnter` / `onMouseLeave` that set `tooltipFinding` and `tooltipPos`. A fixed-position div (~lines 884–897) renders when `tooltipFinding` is set, with:
  - Art {articleId}.{atomId} · severity
  - descriptionAr or evidenceSnippet (line-clamp-3)
  - Badge: Safe vs Violation
- **Recommendation:** Keep this. If we add a rich editor, use the same approach: map hovered node to finding (e.g. by data-finding-id or by recalculating offset from cursor position in the plain-text view).

### Suggested small improvements

1. **Copy / UX:** Add a context menu item “Add to findings” that opens the same modal as “Mark as Violation” (and optionally keep “Mark as Violation” as an alias or remove it) so wording matches “Add to findings.”
2. **“Add Note”:** Either wire it to the same modal (e.g. as “Add to findings” with optional comment) or implement a separate note flow (would require a note schema if we want persistence).
3. **Atom per article:** If product wants atom options to depend on article, add a small mapping (articleId → list of atom labels) and drive the Atom dropdown from the selected article; backend already accepts any atom_id string.
4. **Highlights without selecting a report:** If we want “show all findings for this script” (e.g. from latest job), we could default `selectedReportForHighlights` to the latest report when the script has one, or add a “Show all (latest report)” so highlights appear without an explicit report click.

---

*End of audit. This should give enough detail to keep the current behavior and to close any remaining UX gaps (wording, default report, atom-by-article) without changing the offset or report-linkage model.*
