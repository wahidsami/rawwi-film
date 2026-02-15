# Glossary / Slang Lexicon — Debug & Patch Plan

## 1. Why “Glossary additions are not considered by AI”

### 1.1 Broken path (persistence)

- **Glossary UI** calls `lexiconApi.getTerms()` and `lexiconApi.addTerm()` (and update/deactivate).
- Those hit **Supabase Edge Function** `GET /lexicon/terms` and `POST /lexicon/terms`.
- The **lexicon Edge Function** (`supabase/functions/lexicon/index.ts`) is a **stub**:
  - `GET /lexicon/terms` always returns `[]`.
  - `POST /lexicon/terms` and `PUT /lexicon/terms/:id` return **501 Not implemented**.
- So:
  - The UI never sees existing terms from the DB.
  - Any “Add term” or “Edit” never reaches the database.
- The **worker** does **not** use the Edge Function. It reads **directly from `slang_lexicon`** (in-memory cache refreshed every 2 minutes). So:
  - Terms inserted **outside the UI** (e.g. via SQL) **are** used by the worker.
  - Terms “added” only via the current UI are never stored, so the worker never sees them.

**Conclusion:** “Glossary additions are not considered” because **the API that the Glossary uses is not implemented**; nothing is persisted from the UI.

### 1.2 Broken path (highlights)

- The worker **does** create findings for mandatory lexicon terms and inserts them into `analysis_findings` with `source: 'lexicon_mandatory'`.
- In `apps/worker/src/pipeline.ts`, those rows are inserted with **`start_offset_global: null`** and **`end_offset_global: null`**.
- The **ScriptWorkspace** viewer only highlights findings that have valid `startOffsetGlobal` and `endOffsetGlobal` and pass `offsetValid()` (slice of canonical content matches evidence).
- So even when a lexicon finding exists and is returned by `GET /findings`, it **never gets a highlight** because offsets are null.

**Conclusion:** Lexicon violations appear in the report list but **do not appear as highlights** in the script viewer.

### 1.3 What already works

- **DB:** `slang_lexicon` and `slang_lexicon_history` exist with correct schema and triggers.
- **Worker:** Loads active terms, matches per chunk (word/phrase/regex), inserts mandatory findings with correct article_id, atom_id, severity; GET /findings returns them; UI shows “Lexicon” badge.
- **Viewer:** Highlight logic treats `source === 'lexicon_mandatory'` the same as `source === 'ai'` for styling; the only filter is “has valid global offsets.”

---

## 2. Patch plan (file-by-file)

### 2.1 Backend: `supabase/functions/lexicon/index.ts`

**Goal:** Implement real CRUD and history so the Glossary UI can list, add, update, and deactivate terms, and view history.

**Changes:**

1. **Imports and helpers**
   - Use `createSupabaseAdmin()` for DB access (bypass RLS; auth already enforced by `requireAuth`).
   - Parse path: `GET /lexicon/terms`, `GET /lexicon/history/:id`, `POST /lexicon/terms`, `PUT /lexicon/terms/:id`.
   - Optionally restrict **write** operations (POST, PUT) to admin/regulator roles by reading user metadata or a `roles` table; if not present, allow any authenticated user to write (task said “only admins can write” — implement role check if you have a role source).

2. **GET /lexicon/terms**
   - `supabase.from('slang_lexicon').select('*').eq('is_active', true).order('term')` (or return all and let UI filter; doc says “return active terms” — so `.eq('is_active', true)`).
   - Map rows to camelCase for frontend (id, term, normalized_term, term_type, category, severity_floor, enforcement_mode, gcam_article_id, gcam_atom_id, gcam_article_title_ar, description, example_usage, is_active, created_by, created_at, updated_at).
   - Return array.

3. **POST /lexicon/terms**
   - Body: term (required), term_type, category, severity_floor, enforcement_mode, gcam_article_id, gcam_atom_id?, gcam_article_title_ar?, description?, example_usage?.
   - Compute `normalized_term = term.trim().toLowerCase()`.
   - Normalize `severity_floor`: `severity_floor.toLowerCase()` and map to one of `['low','medium','high','critical']` (DB CHECK).
   - `created_by = auth.userId`.
   - Insert into `slang_lexicon`. On conflict (e.g. unique on normalized_term) return 409 or 400 with message.
   - Return inserted row (camelCase).

4. **PUT /lexicon/terms/:id**
   - Body may include: term, term_type, category, severity_floor, enforcement_mode, gcam_article_id, gcam_atom_id, gcam_article_title_ar, description, example_usage, **is_active**, **changed_by** (display name), **change_reason**.
   - If `term` is updated, recompute `normalized_term` and ensure uniqueness.
   - Normalize severity_floor to lowercase.
   - For history: the existing trigger writes to `slang_lexicon_history` but with `changed_by = NULL`, `change_reason = NULL` on UPDATE. Optional: add columns `last_changed_by` (uuid), `last_change_reason` (text) to `slang_lexicon` and set them in this PUT; then add a migration that updates the trigger to use them when inserting the history row. For minimal patch, just do the UPDATE (history will have old_data/new_data; changed_by/change_reason can stay null until the migration is added).
   - Update row; return updated row (camelCase).

5. **GET /lexicon/history/:id**
   - `id` = lexicon term uuid.
   - `supabase.from('slang_lexicon_history').select('*').eq('lexicon_id', id).order('changed_at', { ascending: false })`.
   - Map to camelCase (id, lexicon_id, operation, old_data, new_data, changed_by, changed_at, change_reason).
   - Return array.

6. **Error handling**
   - 400 for validation (e.g. missing term, invalid severity).
   - 404 if PUT id not found.
   - 409 if POST duplicate normalized_term.

**Tests / validation:** Use `scripts/test-lexicon-api.sh <BASE_URL> <JWT>` (with a valid JWT):
- GET /lexicon/terms → 200, array.
- POST /lexicon/terms with minimal body → 200, body has id and term.
- PUT /lexicon/terms/:id with is_active: false and change_reason → 200.
- GET /lexicon/history/:id → 200, array.

---

### 2.2 Worker: `apps/worker/src/pipeline.ts`

**Goal:** Lexicon findings get correct global offsets so the viewer can highlight them; evidence_snippet from canonical; DEV assertion and mismatch logging.

**Implemented:**

- **Offsets:** `start_offset_global = chunkStart + m.match.startIndex`, `end_offset_global = chunkStart + m.match.endIndex`.
- **Evidence snippet:** When `normalizedText` (canonical) is available and range is in bounds, `evidence_snippet = normalizedText.slice(startGlobal, endGlobal)` so the stored excerpt exactly matches the viewer’s content at those offsets. Fallback: `m.evidence_snippet` when canonical is missing.
- **Context for debugging:** `location.context_before` and `location.context_after` (20 chars each) from canonical, stored in the finding’s `location` jsonb.
- **DEV assertion and mismatch logging:** When `NODE_ENV !== 'production'`, compare `canonical.slice(startGlobal, endGlobal)` to `m.match.matchedText` (exact or NFC/whitespace-normalized). If they differ, log a warning with: `term`, `term_type`, `matchText` (first 80 chars), `slicePreview` (first 80 chars), `chunkStart`, `localStart`/`localEnd`, `startGlobal`/`endGlobal`. Cap at the first 3 mismatches per chunk to avoid log spam.

**Rationale:** `chunk.text` is the exact substring of the job’s `normalized_text` from `[chunk.start_offset, chunk.end_offset]`. The matcher runs on `chunk.text` with no transformation, so `match.startIndex`/`endIndex` are indices into that substring; adding `chunkStart` gives global offsets into canonical. The viewer uses `editorData.content` as canonical; when it matches the job’s normalized text (same version and script_text.content), offsets and excerpt align.

---

### 2.2.1 Coordinate system (confirmed alignment)

- **Chunk source:** When a job is created (POST /tasks), chunks are built from the job’s canonical text (`normalized` = script_text.content or derived). Each chunk has `text = canonical.slice(chunk.start_offset, chunk.end_offset)`, `start_offset`, `end_offset`.
- **Worker:** `processChunkJudge` receives `chunk.text` and `chunk.start_offset`/`end_offset`. It calls `analyzeLexiconMatches(chunkText, supabase)`. The matcher runs on **unchanged** `chunkText` (no lowercase or Arabic normalization), so `match.startIndex`/`endIndex` are indices into that exact string.
- **Global offsets:** `startGlobal = chunk.start_offset + match.startIndex`, `endGlobal = chunk.start_offset + match.endIndex`. So `canonical.slice(startGlobal, endGlobal)` should equal `chunkText.slice(match.startIndex, match.endIndex)` = `match.matchedText`.
- **If matcher ever ran on transformed text** (e.g. lowercased chunk), indices would be into the transformed string and would not align with canonical. Current implementation does **not** transform chunk text before matching, so alignment holds.
- **Mismatch logging strategy:** In development, the first 3 mismatches per chunk are logged (term, matchText, slicePreview, chunkStart, localStart/localEnd, globalStart/globalEnd). Any mismatch suggests either (a) chunk.text is not the slice of canonical (bug in job creation), or (b) canonical passed to the worker is not the same as the one used to create chunks (e.g. job normalized_text changed), or (c) encoding/normalization difference. Investigate by comparing chunk.text to normalizedText.slice(chunkStart, chunkEnd).

---

### 2.2.2 Matching normalization contract

- **`normalized_term` in DB:** Used only for **UI uniqueness** (duplicate check). Stored as `term.trim().toLowerCase()` when creating/updating via the API. It is **not** used for matching in the worker.
- **Worker matching:** Uses the raw **`term`** from `slang_lexicon` (no lowercasing of the pattern for word/phrase; regex is used as-is).
  - **word:** `wordBoundaryRegex(term)` — pattern is regex-escaped and wrapped in word boundaries; flags `gui`. Matching is **case-sensitive** (no `i`). So “BadWord” matches only that casing in the chunk.
  - **phrase:** Escaped term with flags **`gi`** — **case-insensitive** substring.
  - **regex:** `new RegExp(term, "gui")` — **raw pattern**, no lowercasing; `i` = case-insensitive, `u` = Unicode. User is responsible for pattern.
- **Arabic normalization:** **None.** Chunk text and term are matched as-is (no diacritic stripping, no kashida or alef/yaa normalization). So if the script has different Unicode form than the stored term, matches can be missed. Document as “none” unless a later change adds basic Arabic normalization in the matcher.
- **Summary:** For Latin, phrase matching is case-insensitive; word matching is case-sensitive. For regex, the stored pattern is never lowercased. `normalized_term` is for deduplication only.

---

### 2.3 Frontend: ScriptWorkspace highlight DOM and debug

**Goal:** Confirm lexicon findings are treated like AI findings for highlights and add a dev-only debug helper.

**Current state (no code change required for behavior):**
- Highlights are applied in a `useEffect` that filters `reportFindings` to those with valid `startOffsetGlobal`/`endOffsetGlobal` and `offsetValid(content, f)`.
- Each applied finding is wrapped in a `<span data-finding-id={f.id} class="ap-highlight ...">`.
- Lexicon findings are not excluded; they are only skipped because offsets are null. Once the pipeline sets offsets, they will be included automatically.
- `getHighlightedText` (legacy path) also uses `f.startOffsetGlobal`/`f.endOffsetGlobal` and styles `lexicon_mandatory` like `ai` (warning color).

**Change (debug helper):** In `apps/web/src/pages/ScriptWorkspace.tsx`, in the same `useEffect` that applies highlights (after the loop that does `range.surroundContents(el)`), in dev mode only, add:

```ts
if (IS_DEV && container) {
  const marks = container.querySelectorAll('[data-finding-id]');
  console.log('[Highlights] data-finding-id count:', marks.length);
  if (marks.length > 0) {
    const ids = Array.from(marks).slice(0, 5).map(el => el.getAttribute('data-finding-id'));
    console.log('[Highlights] first few data-finding-ids:', ids);
  }
}
```

(This or similar already exists; ensure it runs and logs count + first few ids.) Optionally add a small dev-only button or label that shows `$$('[data-finding-id]').length` (e.g. in the toolbar near “Count highlights”) so testers can see the number without opening the console.

---

### 2.4 GCAM articles / atoms and pipeline consistency

- **DB:** Lexicon terms store `gcam_article_id` (int) and `gcam_atom_id` (text). These are the same “GCAM article/atom” identifiers used elsewhere (e.g. Judge returns article_id, atom_id).
- **Pipeline:** Lexicon findings are inserted with `article_id: m.articleId` (from term’s `gcam_article_id`) and `atom_id: m.atomId` (from term’s `gcam_atom_id`). So the pipeline already uses the same IDs consistently.
- **Methodology / administrative validation:** If some materials are “administrative validation” and not analyzed by AI, they are typically excluded at the **job creation** or **chunk selection** level (e.g. by script type or version metadata). The lexicon is applied to the same chunks the Judge sees; there is no separate exclusion for lexicon. If you need to exclude certain script types from lexicon matching, that would be a new rule (e.g. skip lexicon step when `script.metadata?.type === 'administrative'`). No change proposed here unless you define that rule.

---

### 2.5 Soft signals

- **Current:** `analyzeLexiconMatches` returns `softSignals` but the pipeline does not insert them into `analysis_findings` and does not pass them to the Judge prompt.
- **Options:**
  - **A)** Insert soft-signal matches as findings with a new `source` (e.g. `lexicon_soft`) and possibly a lower severity or “informational” flag so they appear in the list but can be filtered or styled differently.
  - **B)** Pass soft signals into the Judge prompt as extra context (e.g. “The following terms were detected in this chunk as potential signals: …” so the Judge can consider them when deciding violations).
- **Recommendation:** For this patch, **no change**. Document that soft_signal is reserved for future use. If you choose A or B, that can be a follow-up (new source + insert, or extend Judge payload).

---

## 3. Verification checklist

Use this to confirm the full flow after applying the patch.

1. **UI → DB persistence**
   - [ ] Open Glossary as Admin/Regulator.
   - [ ] Add a new term (e.g. word “test-violation-123”, mandatory_finding, article 1, severity medium). Submit.
   - [ ] Reload the page: the term still appears (from GET /lexicon/terms).
   - [ ] In DB: `SELECT * FROM slang_lexicon WHERE term LIKE '%test-violation%';` — one row, is_active = true, normalized_term = 'test-violation-123', severity_floor = 'medium'.

2. **Worker sees the term**
   - [ ] Either wait up to 2 minutes or restart the worker so the lexicon cache refreshes.
   - [ ] Start Smart Analysis on a script that contains the string “test-violation-123” (in the canonical text).
   - [ ] Wait for job to complete.

3. **Finding created**
   - [ ] GET /findings?jobId=<that_job_id> returns at least one finding with source = 'lexicon_mandatory', article_id = 1, evidence_snippet containing “test-violation-123”.
   - [ ] Same finding has start_offset_global and end_offset_global as non-null numbers.

4. **Report and list**
   - [ ] In the app, open the report for that job; the finding appears in the list with the “Lexicon” badge and correct severity/article.

5. **Highlight in ScriptWorkspace**
   - [ ] Open ScriptWorkspace for that script, select the same report for highlights.
   - [ ] The segment containing “test-violation-123” is wrapped in a span with `data-finding-id` equal to that finding’s id.
   - [ ] In dev console: `document.querySelectorAll('[data-finding-id]').length` ≥ 1 and one of the ids matches the lexicon finding.
   - [ ] Optional: use the new debug log to confirm “first few data-finding-ids” includes the lexicon finding id.

6. **Edit / deactivate**
   - [ ] In Glossary, edit the term (e.g. change severity to high) and save. GET /lexicon/terms reflects the change.
   - [ ] Deactivate the term. GET /lexicon/terms no longer returns it (or it appears as is_active: false if you return all). Next analysis does not create a lexicon finding for that term.

7. **History**
   - [ ] GET /lexicon/history/:id for that term returns at least one row (INSERT and optionally UPDATE), with old_data/new_data present.

---

## 4. Optional: History trigger and changed_by / change_reason

If you want `slang_lexicon_history` to store who changed and why:

- Add migration (e.g. `0023_lexicon_history_audit.sql`):
  - `ALTER TABLE slang_lexicon ADD COLUMN IF NOT EXISTS last_changed_by uuid REFERENCES auth.users(id), ADD COLUMN IF NOT EXISTS last_change_reason text;`
  - Replace the UPDATE branch of `slang_lexicon_history_trigger_fn` to set `changed_by = NEW.last_changed_by`, `change_reason = NEW.last_change_reason` when inserting the history row.
- In the lexicon Edge Function PUT handler, set `last_changed_by = auth.userId` and `last_change_reason = body.change_reason` (or similar) in the update payload.

---

## 5. Arabic normalization (current: none)

See **§ 2.2.2 Matching normalization contract**. There is currently **no** Arabic normalization (diacritics, kashida, alef/yaa). That can cause missed matches when the script text and the stored term differ in form. Addressing that is a separate change: normalize both the chunk text and the term (or only the chunk text) before matching (e.g. strip diacritics, normalize alef/yaa, collapse kashida). No patch is proposed in this document; it can be added later in the worker’s lexicon matcher.

---

## 6. File list (summary)

| File | Action |
|------|--------|
| `supabase/functions/lexicon/index.ts` | Replace stub with full GET/POST/PUT and GET history implementation. |
| `apps/worker/src/pipeline.ts` | Set `start_offset_global` / `end_offset_global` for lexicon findings from chunk + match offsets. |
| `apps/web/src/pages/ScriptWorkspace.tsx` | Ensure dev debug logs (and optional toolbar) for `[data-finding-id]` count and first few ids. |
| `supabase/migrations/0023_lexicon_history_audit.sql` | Add last_changed_by, last_change_reason to slang_lexicon; update trigger to copy them into history. |
| `scripts/test-lexicon-api.sh` | Curl script to validate GET/POST/PUT/GET history with a JWT. |

No change to GET /findings, ScriptWorkspace highlight filtering, or FindingCard — they already support lexicon findings once offsets are set.
