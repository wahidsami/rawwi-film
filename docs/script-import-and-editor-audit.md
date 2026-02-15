# Script Import and Editor Audit (RaawiFilm)

**Purpose:** Map the full current flow for script creation, file upload, persistence, and editor so DOCX/PDF import and a rich-text editor can be implemented safely.

---

## 1. Overview

- **Current behavior:** Scripts are created from the Script Workspace. The UI accepts `.pdf`, `.docx`, and `.txt` in the file input, but **only `.txt` is fully supported**. For TXT, the frontend reads the file with `file.text()` and sends the text in the extract request body. For DOCX/PDF, the frontend uploads the file to storage and calls extract **without** a text body; the Edge Function then returns **501** (DOCX/PDF extraction not available in Edge).
- **Canonical script text** lives in:
  - `script_versions.extracted_text` (raw extracted string)
  - `script_text.content` (normalized full text, one row per version)
- **Analysis** uses normalized text from `script_versions.extracted_text` (normalized via `normalizeText()`), chunked and stored in `analysis_chunks`; the worker processes chunks. The Script page displays content from `script_text` (via GET /scripts/editor) in a **read-only** div with `whitespace-pre-wrap`, no rich-text toolbar.
- **Constraints:** Supabase Edge Functions run on **Deno**. No native DOCX/PDF parsing exists in Edge today; the extract function explicitly returns 501 for DOCX/PDF and suggests sending pre-extracted text or using a worker.

---

## 2. Frontend: Script creation & upload flow

### File paths

| Role | Path |
|------|------|
| Script workspace page | `apps/web/src/pages/ScriptWorkspace.tsx` |
| Scripts API (client) | `apps/web/src/api/index.ts` |
| HTTP client + mock | `apps/web/src/api/httpClient.ts` |

### File input and accept

- **Location:** `ScriptWorkspace.tsx` ~lines 709–716.
- **Element:** `<input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />`
- **Trigger:** A button in the header (“Import Script Document” / “استيراد ملف النص”) calls `fileInputRef.current?.click()`.
- **Accept:** `.pdf`, `.docx`, `.txt` (no MIME restriction in `accept`; backend storage already allows these MIMEs).

### Upload handler: `handleFileUpload` (lines 346–406)

1. **Guard:** `const file = e.target.files?.[0]; if (!file || !script) return;`
2. **State:** `setIsUploading(true)`, `setUploadStatus('uploading')`.
3. **Get signed URL:** `scriptsApi.getUploadUrl(file.name)` → `POST /upload` with body `{ fileName: file.name }` → returns `{ url, path }`.
4. **Upload file to storage:** `scriptsApi.uploadToSignedUrl(file, url)` → `PUT` to the signed URL with `Content-Type: file.type || 'application/octet-stream'` and `body: file`.
5. **Create version:** `scriptsApi.createVersion(script.id, { source_file_name, source_file_type, source_file_size, source_file_path, source_file_url })` → `POST /scripts/versions` with the above fields (path from step 3).
6. **Extract text:**
   - **If `ext === 'txt'`:** `const fileText = await file.text();` then `scriptsApi.extractText(version.id, fileText)` (sends text in body). Response may include `extracted_text`; `textToShow` is that or `fileText`.
   - **Else (docx/pdf):** `scriptsApi.extractText(version.id)` (no body). Backend tries to download from storage and parse; for docx/pdf it returns **501** with message that extraction is not available in Edge. Frontend catches and shows toast “Extraction for this file type is not enabled yet” (or rethrows).
7. **Post-upload:** `setExtractedText(textToShow)`, `setUploadStatus('done')`, `updateScript(script.id, { currentVersionId: version.id })`, then `scriptsApi.getEditor(script.id, version.id)` to load editor content/sections and `setEditorData(data)`.

### UI state used

- `isUploading`, `uploadStatus` ('idle' | 'uploading' | 'extracting' | 'done' | 'failed'), `extractedText`.
- `editorData` (EditorContentResponse | null) set after upload or from `loadEditor()`.
- No explicit file size or type validation in the handler (browser + storage bucket limits apply).

### Validation rules

- **Frontend:** None beyond `file` and `script` presence. No max file size check in JS.
- **Backend upload:** `supabase/functions/_shared/utils.ts` `sanitizeFileName()`: alphanumeric, `. _ -` and spaces, max length 255, no path traversal.
- **Storage bucket (0003_phase1a.sql):** `file_size_limit = 52428800` (50 MB), `allowed_mime_types = ARRAY['text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']`.

### Preview logic

- No separate “preview” step. After a successful TXT flow, the main editor area shows content from `editorData.content` (or `extractedText` as fallback). For DOCX/PDF, extraction fails so the user sees the 501 toast and no new content.

---

## 3. Backend/Edge: Endpoints and handlers

### Route mapping (Supabase Edge: path = `/functions/v1/<name>`)

| Route | Handler file | Methods |
|-------|--------------|--------|
| `/upload` | `supabase/functions/upload/index.ts` | POST |
| `/scripts` (and subpaths) | `supabase/functions/scripts/index.ts` | GET, POST, DELETE |
| `/extract` | `supabase/functions/extract/index.ts` | POST |
| `/tasks` | `supabase/functions/tasks/index.ts` | GET, POST |

### POST /upload

- **File:** `supabase/functions/upload/index.ts`
- **Body:** `{ fileName: string }`
- **Response:** `{ url: string, path?: string }` (signed upload URL; path = `{userId}/unscoped/{timestamp}_{safeName}`).
- **Logic:** Sanitize filename, build object path, `createSignedUploadUrl(objectPath, { upsert: false })`, rewrite URL host to `PUBLIC_SUPABASE_URL` for browser.
- **Errors:** 400 invalid/missing fileName, 500 storage error.

### POST /scripts/versions

- **File:** `supabase/functions/scripts/index.ts` (rest === "versions" or rest.startsWith("versions/")).
- **Body:** `scriptId`, optional `source_file_name`, `source_file_type`, `source_file_size`, `source_file_path`, `source_file_url`.
- **Response:** ScriptVersion shape (id, scriptId, versionNumber, source_file_*, extracted_text, extraction_status, createdAt).
- **Logic:** Resolve script, check ownership (created_by or assignee_id), get next version_number, insert into `script_versions` with extraction_status = "pending", update `scripts.current_version_id`.
- **Version insert columns:** script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extraction_status (default "pending").

### POST /extract

- **File:** `supabase/functions/extract/index.ts`
- **Body:** `{ versionId: string, text?: string }`
- **Response:** ScriptVersion-shaped object (frontend).
- **Logic:**
  - Load version and script; check script ownership.
  - If extraction_status === "done" and extracted_text present, return version (no re-extract).
  - **If `body.text` is provided:** use it as `extractedText` (trim).
  - **Else:** download file from storage using `version.source_file_path`, then:
    - **.txt:** `await blob.text()`.
    - **.docx:** return **501** “DOCX extraction not available in Edge; send extracted text in request body (text field)”.
    - **.pdf:** return **501** “PDF extraction not available in Edge runtime; use worker or send pre-extracted text”.
    - Other: `blob.text()`.
  - Normalize: `normalizeText(extractedText)`, hash with `sha256Hash`, update `script_versions` (extracted_text, extracted_text_hash, extraction_status = "done"), call `saveScriptEditorContent()` (script_text + script_sections), then `runIngest()` (create analysis_job + analysis_chunks). Return updated version.

### GET /scripts/editor

- **File:** `supabase/functions/scripts/index.ts` (rest === "editor", query scriptId & versionId).
- **Query:** `scriptId`, `versionId`
- **Response:** `{ content: string, sections: EditorSectionResponse[] }`. Content from `script_text.content`; sections from `script_sections` (id, index, title, startOffset, endOffset, meta).

### POST /tasks

- **File:** `supabase/functions/tasks/index.ts`
- **Body:** `{ versionId: string }`
- **Response:** `{ jobId: string }`
- **Logic:** Load version and script; require extraction_status === "done" and non-empty extracted_text. Normalize and hash; optionally ensure script_text/sections via `saveScriptEditorContent`; chunk with `chunkText(normalized, 12_000, 800)`; insert analysis_job and analysis_chunks; return job id.

### Request/response payloads (concise)

| Endpoint | Request | Response |
|----------|---------|----------|
| POST /upload | `{ fileName }` | `{ url, path? }` |
| POST /scripts/versions | `{ scriptId, source_file_name?, source_file_type?, source_file_size?, source_file_path?, source_file_url? }` | ScriptVersion |
| POST /extract | `{ versionId, text? }` | ScriptVersion (with extracted_text, extraction_status) |
| GET /scripts/editor | Query: scriptId, versionId | `{ content, sections }` |
| POST /tasks | `{ versionId }` | `{ jobId }` |

### Error handling

- Extract: 400 (no path, invalid body), 403 (forbidden), 404 (version not found), 500 (DB/storage), 501 (DOCX/PDF).
- Scripts: 400/403/404/500; DELETE /scripts/:id returns 404/403/500.
- Tasks: 400 “Extract first”, 403/404, 500.

---

## 4. Database: Tables, columns, constraints, RLS

### Tables involved

| Table | Purpose |
|-------|---------|
| `scripts` | One row per script; has current_version_id. |
| `script_versions` | One row per version; holds source_file_*, extracted_text, extraction_status. |
| `script_text` | One row per version_id; content (normalized full text), content_hash. |
| `script_sections` | Sections per version (title, start_offset, end_offset, index). |
| `analysis_jobs` | One per analysis run; normalized_text, script_content_hash. |
| `analysis_chunks` | Chunks per job (text, start_offset, end_offset, start_line, end_line, status). |
| `analysis_findings` | Findings per job (offsets, severity, etc.). |
| `analysis_reports` | Report per job. |

### scripts (0001_init + 0003_phase1a)

- Columns: id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, updated_at, assignee_id, current_version_id.
- current_version_id FK → script_versions(id) ON DELETE SET NULL.
- RLS: select/insert/update/delete for created_by; select for assignee_id.

### script_versions (0001_init + 0003_phase1a)

- Columns: id, script_id, version_number, source_file_name, source_file_path, source_file_type, source_file_size, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at, updated_at.
- UNIQUE(script_id, version_number).
- extraction_status CHECK: pending, extracting, done, failed.
- RLS: select via script ownership (created_by or assignee_id); insert/update/delete via script created_by.

### script_text (0008_script_editor)

- version_id PK, content NOT NULL, content_hash, created_at.
- version_id FK → script_versions(id) ON DELETE CASCADE.
- No RLS defined; access is via Edge Functions using service role.

### script_sections (0008_script_editor)

- id, script_id, version_id, index, title, start_offset, end_offset, meta (jsonb), created_at.
- FKs to scripts and script_versions.
- No RLS; access via Edge.

### Where “current version” is determined

- `scripts.current_version_id` is set when a new version is created (POST /scripts/versions) and when the frontend calls `updateScript(script.id, { currentVersionId: version.id })` (dataStore). The canonical “current” version is this column.

### Where canonical script text lives

- **For analysis:** `script_versions.extracted_text` (raw) is normalized and stored in `analysis_jobs.normalized_text` and chunked into `analysis_chunks.text`. So analysis uses normalized plain text.
- **For editor display:** `script_text.content` (normalized full text). GET /scripts/editor returns this as `content` and sections from `script_sections`. So the “canonical” display text is plain text in `script_text.content` (and duplicated conceptually in script_versions.extracted_text after extraction).

### Unique constraints

- script_versions: UNIQUE(script_id, version_number).
- script_text: version_id is PK (one row per version).
- analysis_chunks: UNIQUE(job_id, chunk_index).

### Triggers / RLS

- scripts, script_versions: updated_at trigger. RLS as above. script_text and script_sections have no RLS (service role only).

---

## 5. Script page: Rendering/editor details

### File path

- `apps/web/src/pages/ScriptWorkspace.tsx`

### How content is loaded

- **When script + currentVersionId exist:** `loadEditor()` runs (useCallback): `scriptsApi.getEditor(script.id, script.currentVersionId)` → GET /scripts/editor → sets `editorData` (content + sections).
- **After upload:** When uploadStatus === 'done', loadEditor runs again; also right after upload the code calls getEditor and setEditorData.
- **Fallback:** If no editorData content, `displayContent` uses `extractedText` (state set during upload).

### Component structure (main viewer)

- A **read-only** div (ref `editorRef`) with:
  - `className`: `... whitespace-pre-wrap text-right`, `dir="rtl"`, `role="region"`.
  - Content: either **findingSegments** (spans with highlights for report findings) or **viewerHtml** (dangerouslySetInnerHTML).
- **viewerHtml** = `insertSectionMarkers(getHighlightedText(), sections)`:
  - `getHighlightedText()`: takes `displayContent`, wraps scriptFindings (legacy) evidence snippets in `<span>` with highlight classes.
  - `insertSectionMarkers`: injects `<span id="section-{index}" data-section-index="{index}">` at section start offsets so the sidebar can scroll to sections.
- **findingSegments:** Built from `reportFindings` and `displayContent` via `buildFindingSegments(displayContent, reportFindings)` (offsets from analysis findings). Renders clickable spans for each segment (violation vs approved styling).
- **displayContent** = editorData?.content ?? extractedText; **sections** = editorData?.sections ?? [].

So the “editor” is not an editable control; it’s a **contenteditable-like** div only for selection (context menu “Mark as violation”, manual finding). No toolbar, no formatting.

### State management & data loading

- **Editor:** editorData (EditorContentResponse | null), editorLoading, editorError; loadEditor depends on script.id and script.currentVersionId.
- **Findings/reports:** reportFindings, selectedReportForHighlights, reportHistory from reportsApi; findings from dataStore (scriptFindings).
- **Offsets:** Context menu and manual finding use getSelectionOffsets(editorRef) to map DOM selection to character offsets in displayContent.

### Autosave

- None. Content is set by extract (and optionally by tasks when queuing analysis via saveScriptEditorContent). No user-editing path that persists back to script_text.

### Where an editor could be embedded

- Replace or wrap the central viewer div (the one with editorRef, ~lines 841–895). Currently it’s a single div showing either segment spans or viewerHtml. A rich-text editor (e.g. TipTap) could sit here: same ref for scroll/section navigation, and either the same `displayContent` as initial value or a new field (e.g. HTML) with a sync path back to plain text for analysis.

---

## 6. Analysis pipeline: Integration points

### Trigger

- **Location:** ScriptWorkspace header button “Start Smart Analysis” / “تحليل ذكي”.
- **Handler:** `handleStartAnalysis` (lines 316–339): `scriptsApi.createTask(script.currentVersionId)` → POST /tasks with `{ versionId }`.
- **Result:** jobId returned; polling starts via tasksApi.getJob(jobId); “View Report” uses analysisReportId / report route.

### Source text for analysis

- **POST /tasks** reads version from DB: `script_versions.extracted_text`. It does **not** read from a file again. It normalizes with `normalizeText(v.extracted_text)`, hashes, optionally calls `saveScriptEditorContent` (so script_text/sections are in sync), then chunks with `chunkText(normalized, 12_000, 800)` and creates analysis_jobs + analysis_chunks.
- So analysis always uses **version.extracted_text** (normalized). That text is the same as what ends up in script_text.content after extract (and after tasks’ saveScriptEditorContent when analysis is started without a prior full extract flow).

### Chunking

- **Implementation:** `supabase/functions/_shared/utils.ts`: `chunkText(normalized, maxChunkSize = 12_000, overlap = 800)`.
- **Logic:** Splits normalized string into chunks with overlap; each chunk has text, start_offset, end_offset, start_line, end_line (line numbers derived from normalized text with `\n`). Stored in analysis_chunks; worker processes chunks (separate from this audit).

### Normalization/cleaning

- **normalizeText (utils.ts):** `raw.normalize("NFC").replace(/\s+/g, " ").trim()` — single space, no leading/trailing spaces. So newlines and multiple spaces are collapsed before chunking and storage in script_text.

---

## 7. DOCX/PDF parsing options (client vs server)

### Should parsing run client-side or server-side?

- **Current:** TXT is effectively “parsed” in the browser (file.text()) and text is sent to extract. DOCX/PDF are uploaded to storage and the server returns 501.
- **Options:**
  - **Client-side:** Extract text from DOCX/PDF in the browser (e.g. mammoth for DOCX, pdf.js for PDF), then send `extractText(versionId, text)`. No Edge changes for parsing; only frontend + optional validation. Fits current “send text in body” contract.
  - **Server-side (Edge):** Deno Edge has no native DOCX/PDF libs in the standard library. Possible to use a small WASM or pure-JS parser if available for Deno; often heavier and may hit size/runtime limits.
  - **Server-side (Node worker):** The repo has `apps/worker`; a worker could download the file from storage, run Node-based parsers (e.g. mammoth, pdf-parse), write extracted text back to script_versions (or call an internal API that updates version + runs ingest). Then the frontend would only upload and poll until extraction_status === "done".

### Runtime constraints

- **Supabase Edge:** Deno, no Node APIs. Allowed deps: npm specifiers or JSR. Must be compatible with Deno (no native Node bindings for PDF/DOCX without a compatible port).
- **Browser:** Full DOM; can use mammoth.js, PDF.js, etc.
- **Worker (Node):** Full Node; can use any npm package (mammoth, pdf-parse, pdf2json, etc.).

### Storage bucket

- **Bucket:** `uploads`, private, 50 MB limit, MIME types already include text/plain, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/pdf. Path pattern: `{userId}/unscoped/{timestamp}_{fileName}`. So DOCX/PDF are already allowed for upload; only extraction is missing.

### Recommended parsing location

- **Easiest safe approach:** **Client-side extraction** for both DOCX and PDF:
  - **DOCX:** Use **mammoth** (e.g. mammoth.js in browser) to get plain text; send in POST /extract body as `text`. No Edge change for DOCX parsing; extract already accepts `text`.
  - **PDF:** Use **pdf.js** (Mozilla’s PDF.js) in the worker thread or main thread to extract text; send in POST /extract body as `text`. Same as above.
- **Alternative:** Add a **Node worker** step: after upload, enqueue “extract” job; worker downloads file from storage, runs mammoth (DOCX) or pdf-parse (PDF), then PATCHes script_versions (or calls an internal Edge endpoint) to set extracted_text and extraction_status, then triggers ingest. Requires a new worker job type and possibly an internal API to update version + run ingest.

### Suggested libraries

| Format | Client (browser) | Edge (Deno) | Node (worker) |
|--------|------------------|-------------|----------------|
| DOCX   | mammoth          | Not recommended (no mature Deno DOCX lib) | mammoth |
| PDF    | pdfjs-dist (getDocument + getTextContent) | Not recommended | pdf-parse or pdf2json |

### Arabic PDFs: risks and mitigation

- **Risks:** RTL layout, line breaks mid-word, headers/footers, scanned PDFs (no text layer), encoding.
- **Mitigation:** Use a text-extraction API that preserves order (e.g. PDF.js getTextContent with items); optionally normalize with NFC and collapse whitespace (already in normalizeText). For scanned PDFs, OCR would be required (e.g. Tesseract in a worker or external service)—out of scope for “text extraction” only.

---

## 8. Rich text editor options & recommendation

### Existing UI stack

- **Dependencies (apps/web):** React 19, react-router-dom, zustand, lucide-react, tailwind (Tailwind 4), clsx, tailwind-merge. No shadcn/MUI; custom components (Button, Card, Input, Modal, Select, Textarea, Badge, etc.) in `apps/web/src/components/ui/`.

### Editor framework recommendation

- **TipTap** (ProseMirror-based): Works well with React, supports RTL, can output HTML or JSON; can restrict to a “plain text like” schema so storage stays simple. Fits “toolbar + basic formatting + keep analysis text clean” if we strip formatting when deriving plain text.
- **Alternatives:** Slate (more low-level), Quill (mature but less React-native), Lexical (React-first). TipTap is a good balance of ease and control.

### What to store

- **Required:** Plain text for analysis (unchanged). Analysis must keep using normalized text from script_versions.extracted_text (or a derived field); chunking and findings depend on character offsets in that text.
- **Optional:** Rich format for display/annotations:
  - **Option A:** Add `script_text.content_html` (or a new column) to store HTML from the editor; keep `script_text.content` as plain text (for analysis and offset-based highlights). On load, editor gets content_html if present else content.
  - **Option B:** Store only plain text; editor shows it with minimal formatting (e.g. bold/italic in memory only, or no formatting). Simpler but no persistent rich formatting.

Recommendation: **Option A** — add optional `content_html` (nullable) to script_text; editor saves both: strip to plain text → update `content` (and script_versions.extracted_text if we want a single source of truth), and store HTML in `content_html` for display. Analysis and findings continue to use `content` (plain).

### Where to integrate toolbar and editor

- **Place:** Replace the current central viewer div in ScriptWorkspace (the one with editorRef and findingSegments/viewerHtml). Add a toolbar above it (bold, italic, headings, etc.) and a TipTap Editor inside a wrapper that:
  - Loads initial value from editorData.content (or content_html when available).
  - On blur or explicit save, derives plain text from the editor (e.g. `editor.getText()` or serialize to text), and optionally persists HTML. Persistence could be a new PATCH /scripts/editor or extend POST /extract response flow; need an endpoint to update script_text.content (+ content_html) and optionally script_versions.extracted_text if we keep them in sync.
- **Finding highlights:** Keep offset-based highlighting: findings use startOffsetGlobal/endOffsetGlobal on the **plain** content. So the editor’s “document” for analysis is the plain-text view; the rich view is for display only. When rendering, either show the plain content with highlight spans (current approach) or map offsets into the rich document (harder). Easiest is to keep a “view mode” that shows plain content with highlights, and an “edit mode” that shows the rich editor (or show editor with highlights overlaid if the editor supports decorations at offsets).

### Migration needs

- **DB:** Add nullable `content_html text` to `script_text` if we store HTML. No change to script_versions or analysis tables for “minimal viable” editor.
- **API:** New or updated endpoint to PATCH script_text (content and content_html) for the current version; auth/ownership same as GET /scripts/editor.

### Minimal viable editor plan

1. Add TipTap (or chosen editor) to the Script page; toolbar with bold, italic, headings, maybe list.
2. Store plain text in `script_text.content` (and use for analysis); optionally store HTML in `script_text.content_html`.
3. Load: GET /scripts/editor returns content (and content_html if column exists); editor initializes from content_html ?? content.
4. Save: On demand or on blur, serialize editor to plain text (and HTML); call PATCH to update script_text. Do **not** change script_versions.extracted_text on every edit (only on re-import) to avoid breaking existing analysis jobs; or define a single source of truth and migrate.
5. Finding highlights: Keep using displayContent (plain) and offset-based segments for the “view” that shows findings; editor can be a separate mode or the same area with decorations.

---

## 9. Implementation checklist

### Frontend: file input and import

- [ ] Keep `accept=".pdf,.docx,.txt"` (or add MIME equivalents if desired).
- [ ] For **.txt:** keep current flow (file.text() → extract with body.text).
- [ ] For **.docx:** integrate mammoth in the browser; on file select, extract text with mammoth, then call extract(versionId, text). Optionally show a short “Extracting…” state.
- [ ] For **.pdf:** integrate PDF.js; on file select, extract text (e.g. getDocument + getTextContent), then call extract(versionId, text). Handle multi-page and encoding.
- [ ] Optional: file size check (e.g. warn above 10 MB for PDF/DOCX).
- [ ] Error handling: show clear message for unsupported/corrupt files and for 501 from backend (fallback if client extraction is not used).

### Backend: import and parsing

- [ ] **If client sends text:** No change to extract for DOCX/PDF; current 501 branch can remain for “no body.text” case when file is docx/pdf (or remove 501 for docx/pdf once client always sends text).
- [ ] **If server-side parsing (worker):** New job type “extract”; worker downloads from storage by path, runs mammoth (DOCX) or pdf-parse (PDF), then updates script_versions (extracted_text, extraction_status) and triggers ingest (or calls Edge to run the same logic as POST /extract after setting text). Ensure only one “writer” of extracted_text to avoid races.

### Storage and DB

- [ ] No change to bucket or path pattern; MIMEs already allow pdf/docx.
- [ ] If rich editor: add migration for `script_text.content_html` (nullable text).
- [ ] If any new table or column for “original file” reference, document and add RLS if accessed from client.

### Rich text editor

- [ ] Add TipTap (and required deps) to apps/web.
- [ ] Add toolbar component (bold, italic, headings, etc.) and wire to editor.
- [ ] Replace or wrap central script viewer div with TipTap Editor; load content from editorData (content_html ?? content).
- [ ] Implement save path: serialize to plain text + HTML; new PATCH /scripts/editor or similar to update script_text.
- [ ] Keep analysis and findings using plain text and existing offsets; decide how “edit mode” and “view mode” interact with finding highlights (e.g. view mode = plain + highlights, edit mode = rich without highlights, or add offset-based decorations in editor).

### Tests and manual verification

- [ ] TXT upload still works (create version, extract with text, editor loads, analysis can start).
- [ ] DOCX upload: client extracts text and sends to extract; version shows in editor; analysis can start.
- [ ] PDF upload: same as DOCX.
- [ ] Large file (e.g. 5 MB PDF): no timeout; progress or chunked read if needed.
- [ ] Arabic DOCX/PDF: correct RTL and character integrity in editor and analysis.
- [ ] Section list and scroll-to-section still work after editor change.

### Edge cases

- [ ] **Huge PDFs:** Consider size limit (e.g. 50 MB already); for very long documents, consider chunked extraction or warning.
- [ ] **Scanned PDFs (no text layer):** Show clear message “No extractable text”; do not send empty string to extract (or handle in backend and set extraction_status = failed).
- [ ] **Mixed Arabic/English:** Normalization (NFC) and PDF.js text order; test with mixed content.
- [ ] **Encoding:** Ensure UTF-8 for DOCX/PDF extraction and in blob.text() for TXT.
- [ ] **Replace file:** Current flow creates a new version; ensure currentVersionId and editor data refresh correctly when user replaces file (already partially there; verify with DOCX/PDF).

---

*End of audit. This document should give another engineer everything needed to implement DOCX/PDF import and a rich-text editor without guessing.*
