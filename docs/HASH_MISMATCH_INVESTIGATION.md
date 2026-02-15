# Hash Mismatch Investigation: AI Highlights Never Work

## Step 1 — Reproduction (expected outcome)

**Fresh flow:** Import DOCX → Start Smart Analysis → Click Highlight on report card.

**Expected:** No banner; highlights apply.  
**Observed (before fix):** Banner "Script text changed since this analysis…"; no highlights (or all offsets invalid).

---

## Step 2 — How hashes are computed and stored

### A) `editorData.contentHash` (viewer side)

| Item | Detail |
|------|--------|
| **Where set** | `ScriptWorkspace` loads editor via `scriptsApi.getEditor(script.id, script.currentVersionId)` and stores result in `editorData`. |
| **Source** | **GET /scripts/editor** → `supabase/functions/scripts/index.ts`: reads `script_text` for `version_id` and returns `contentHash: textRow.content_hash`. |
| **DB field** | `script_text.content_hash` (nullable). |
| **Input to hash** | The hash is **not** computed in the frontend. It is whatever was **stored** when `script_text` was written (by extract or by POST /tasks when filling missing content). |
| **Normalization** | N/A on read; the string that was hashed is the same one used to fill `script_text.content` at write time (see below). |

**Conclusion:** `editorData.contentHash` is exactly `script_text.content_hash` for the **current** script version (`script.currentVersionId`).

---

### B) `analysis_jobs.script_content_hash` (job side)

| Item | Detail |
|------|--------|
| **Where computed** | **POST /tasks** (`supabase/functions/tasks/index.ts`). |
| **Logic** | 1. Load `script_text` for the job’s `version_id`. 2. If `script_text.content` exists and non-empty: `normalized = st.content.trim()`, `script_content_hash = st.content_hash` if present, else `sha256Hash(normalized)`. 3. If no content: compute `normalized` from `content_html` or `extracted_text` (same as extract), `script_content_hash = sha256Hash(normalized)`, then `saveScriptEditorContent(..., normalized, script_content_hash)` and use that hash for the job. |
| **Chunking** | Chunks are built from the same `normalized` string; offsets refer to this canonical text. |
| **Normalization** | When content is missing: `normalizeText(htmlToText(contentHtml))` or `normalizeText(extracted_text)`. `normalizeText` = NFC, collapse `\s+` to space, trim. |

**Conclusion:** Job hash is either (1) **reused** from `script_text.content_hash` when content exists, or (2) **computed** when content is missing and then written to `script_text` via `saveScriptEditorContent`.

---

## Step 3 — Comparison and root cause

| Canonical source | Editor hash | Job hash |
|------------------|------------|----------|
| **Editor** | `script_text.content_hash` for `script.currentVersionId` (from GET /scripts/editor). | — |
| **Job** | — | From POST /tasks: either `script_text.content_hash` for job’s `version_id`, or `sha256Hash(normalized)` when content was missing. |

**Same version, content and hash present:**  
- Extract (or a previous /tasks run) wrote `script_text.content` and `script_text.content_hash`.  
- POST /tasks sees existing content and uses `script_content_hash = st.content_hash`.  
- GET /scripts/editor returns that same `content_hash`.  
- So `editorData.contentHash === job.scriptContentHash` → no mismatch.

**Root cause 1 — `script_text.content_hash` missing:**  
- If `script_text.content` was written but `script_text.content_hash` was **not** (e.g. old code path, or failed upsert), then:  
  - GET /scripts/editor returns `contentHash: null`.  
  - POST /tasks with existing content does: `script_content_hash = sha256Hash(normalized)` (because `st.content_hash` is null) and does **not** call `saveScriptEditorContent`, so `script_text.content_hash` stays null.  
- Result: job has a non-null hash; editor has null → condition `editorData?.contentHash != null` can be false, so we might not show the banner, but **if** the frontend or another path ever had a non-null editor hash from elsewhere, we could see a mismatch. More importantly: if later we **do** have a non-null editor hash (e.g. after a backfill), it could differ from the job’s hash if the job’s hash was computed with different input (e.g. different trim).  
- **Fix:** When content exists but `content_hash` is null/empty, compute hash and **backfill** by calling `saveScriptEditorContent(..., normalized, script_content_hash)` so `script_text.content_hash` and `analysis_jobs.script_content_hash` stay in sync and the editor sees the same hash as the job.

**Root cause 2 — Version mismatch:**  
- Report list items have `versionId` (job’s `version_id`). Editor content is loaded for `script.currentVersionId`.  
- If the user runs analysis on version A, then switches to version B (e.g. new import), `editorData` is for B while the selected report (and job) are for A. Then `editorData.contentHash` is for B and `job.script_content_hash` is for A → they will not match.  
- **Fix:** Treat **version mismatch** as a canonical mismatch: when `selectedReportForHighlights.versionId != null && selectedReportForHighlights.versionId !== script.currentVersionId`, show the same banner and do not apply highlights (same as hash mismatch).

---

## Step 4 — Fix (minimal and robust)

1. **POST /tasks**  
   - When `script_text.content` exists but `script_text.content_hash` is null or empty:  
     - Set `script_content_hash = await sha256Hash(normalized)` (same `normalized = st.content.trim()` used for chunking).  
     - Call `saveScriptEditorContent(supabase, versionId, scriptId, normalized, script_content_hash, st.content_html)` to backfill `script_text.content_hash`.  
   - So the job and the editor always share the same hash when content exists.

2. **Viewer (ScriptWorkspace)**  
   - Treat **version mismatch** as canonical mismatch:  
     - `canonicalHashMismatch = (selectedJobCanonicalHash != null && editorData?.contentHash != null && selectedJobCanonicalHash !== editorData.contentHash) || (selectedReportForHighlights?.versionId != null && script?.currentVersionId != null && selectedReportForHighlights.versionId !== script.currentVersionId)`.

3. **Dev assertion**  
   - After creating the job in POST /tasks, (in dev or when a flag is set) re-fetch `script_text.content_hash` for that `version_id` and log a warning if it differs from the job’s `script_content_hash`.

4. **Optional dev logs**  
   - In extract and POST /tasks: log canonical length, hash, and first/last 120 chars (safe preview) when `NODE_ENV` or a correlation flag is set, to confirm both sides use the same input.

---

## Summary

| Cause | Fix |
|-------|-----|
| `script_text.content_hash` null while content exists | /tasks backfills hash via `saveScriptEditorContent` when content exists but hash is missing. |
| Report for version A, editor for version B | Viewer treats version mismatch as canonical mismatch (banner + no highlights). |
| Verify correctness | After job insert, optionally assert `script_text.content_hash === job.script_content_hash` for that version and log on mismatch. |

**Acceptance:**  
- Import DOCX → Start Smart Analysis → Highlight: highlights apply, no banner (same version, hashes match).  
- If script version is changed after analysis (or report is for another version): banner appears and highlights are not applied.

---

## Implementation summary (done)

1. **POST /tasks** (`supabase/functions/tasks/index.ts`): When `script_text.content` exists but `content_hash` is null or empty, we now compute `script_content_hash = sha256Hash(normalized)` and call `saveScriptEditorContent(...)` to backfill `script_text.content_hash`, so the editor and job always share the same hash.
2. **ScriptWorkspace** (`apps/web/src/pages/ScriptWorkspace.tsx`): `canonicalHashMismatch` now also includes **version mismatch**: when `selectedReportForHighlights.versionId !== script.currentVersionId`, we show the banner and do not apply highlights.
3. **Dev assertion**: After job insert, we re-fetch `script_text.content_hash` for that version and log a warning if it differs from the job’s `script_content_hash`.
4. **Log**: After job create we log `canonical_length` and the first 16 chars of `script_content_hash` for debugging in Edge Function logs.
