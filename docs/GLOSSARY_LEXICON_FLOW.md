# Glossary (Slang Lexicon) Flow — End-to-End

This document explains how the **Glossary → Slang Lexicon Management** page works, where terms are stored, and how they are used by the analysis pipeline to produce findings.

---

## 1) Where the page reads/writes data

### UI → API calls

| Action | API call | Endpoint | Implemented? |
|--------|----------|----------|--------------|
| **List terms** | `lexiconApi.getTerms()` | `GET /lexicon/terms` | **Stub: returns `[]`** |
| **Add term** | `lexiconApi.addTerm(term)` | `POST /lexicon/terms` | **Stub: 501 Not implemented** |
| **Edit term** | `lexiconApi.updateTerm(id, updates, changedBy, reason)` | `PUT /lexicon/terms/:id` | **Stub: 501 Not implemented** |
| **Deactivate (delete)** | `lexiconApi.deactivateTerm(id, changedBy, reason)` | `PUT /lexicon/terms/:id` (is_active: false) | **Stub: 501** |
| **History** | `lexiconApi.getHistory(id)` | `GET /lexicon/history/:id` | **Stub: returns `[]`** |
| **Import CSV** | — | — | **Not implemented** (button has no handler) |
| **Export CSV** | — | — | **Not implemented** (button has no handler) |

### File locations

| Layer | File(s) |
|-------|--------|
| **Page** | `apps/web/src/pages/Glossary.tsx` |
| **API client** | `apps/web/src/api/index.ts` (`lexiconApi`), `apps/web/src/api/models.ts` (`LexiconTerm`, `LexiconHistoryEntry`) |
| **Store** | `apps/web/src/store/dataStore.ts` (lexiconTerms, addLexiconTerm, updateLexiconTerm, deactivateLexiconTerm, importLexiconTerms; fetchInitialData calls `lexiconApi.getTerms()`) |
| **Edge Function** | `supabase/functions/lexicon/index.ts` — **stub only**: GET returns `[]`, POST/PUT return 501 |
| **Worker (reads lexicon)** | `apps/worker/src/lexiconCache.ts`, `apps/worker/src/lexiconMatcher.ts` |
| **Worker (writes findings)** | `apps/worker/src/pipeline.ts` |

**Conclusion:** The Glossary UI talks to the **lexicon Edge Function**, which is a **stub**. So with the real API, the page always gets an empty list and cannot add/edit terms. The **worker** reads directly from the **database** (`slang_lexicon`) via Supabase client (service role), so it never uses the Edge Function. Any terms inserted directly into `slang_lexicon` (e.g. via SQL or a future real API) are used by the worker.

---

## 2) Data model

### Table: `slang_lexicon`

Defined in `supabase/migrations/0001_init.sql`.

| Column | Type | Constraints / notes |
|--------|------|----------------------|
| `id` | uuid | PK, default gen_random_uuid() |
| `term` | text | NOT NULL |
| `normalized_term` | text | NOT NULL **UNIQUE** (used by UI for duplicate check; stored as `term.trim().toLowerCase()`) |
| `term_type` | text | NOT NULL, CHECK IN ('word', 'phrase', 'regex') |
| `category` | text | NOT NULL |
| `severity_floor` | text | NOT NULL, CHECK IN ('low', 'medium', 'high', 'critical') — **lowercase** |
| `enforcement_mode` | text | NOT NULL, CHECK IN ('soft_signal', 'mandatory_finding') |
| `gcam_article_id` | int | NOT NULL |
| `gcam_atom_id` | text | nullable |
| `gcam_article_title_ar` | text | nullable |
| `description` | text | nullable |
| `example_usage` | text | nullable |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `created_by` | uuid | FK auth.users |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

Indexes: `idx_slang_lexicon_is_active`, `idx_slang_lexicon_category`, `idx_slang_lexicon_enforcement_mode`.  
There is **no** case-insensitive unique on `term`; the UI uses `normalized_term` (lowercase) for duplicate checks.

### Table: `slang_lexicon_history`

Audit log: one row per INSERT/UPDATE/DELETE on `slang_lexicon` (trigger in 0001_init.sql). Columns: `id`, `lexicon_id`, `operation` (INSERT/UPDATE/DELETE), `old_data` (jsonb), `new_data` (jsonb), `changed_by`, `changed_at`, `change_reason`.

### Frontend model

`LexiconTerm` in `apps/web/src/api/models.ts`: mirrors the table with camelCase; `severity_floor` and enums align with DB. The **add form** uses `severity_floor: 'Medium'` (capitalized); the DB expects **lowercase** (`'medium'`). If the Edge Function is implemented, it must normalize severity to lowercase before insert/update.

---

## 3) Matching logic (worker)

Implemented in `apps/worker/src/lexiconCache.ts` (`findMatches`) and `apps/worker/src/lexiconMatcher.ts`.

### When lexicon is applied

- During **chunk processing**: for each job chunk, `processChunkJudge` calls `analyzeLexiconMatches(chunkText, supabase)`. So matching is **per chunk** (chunk text), not over the full script in one go.
- **Offsets**: Matcher returns `startIndex` and `endIndex` **relative to the chunk** (0-based). Line/column are derived from chunk text.

### Matching rules (by `term_type`)

| term_type | Behavior | Case | Boundaries |
|-----------|----------|------|------------|
| **word** | `wordBoundaryRegex(term)`: regex escape term, then `(?<!\p{L})term(?!\p{L})` (or fallback without lookbehind). | **Unicode-aware** (`u` flag); word boundary uses `\p{L}`. | Word-boundary aware (no match inside another word). |
| **phrase** | Term is regex-escaped, then `new RegExp(escaped, "gi")` — substring search. | **Case-insensitive** (`gi`). | Not word-boundary aware; matches substring anywhere. |
| **regex** | `new RegExp(term, "gui")` — user-provided pattern. | Depends on pattern. | Depends on pattern. |

- **Arabic normalization:** None. No diacritic stripping, no kashida normalization, no alef/yaa normalization. Matching is on the **chunk text as-is** (same Unicode as in DB/cache).
- **Whitespace:** No explicit collapse; phrase/regex match against the chunk string as given.

### How start/end offsets are computed

- **Chunk-relative:** `LexiconMatch.startIndex`, `LexiconMatch.endIndex` are the regex `m.index` and `m.index + m[0].length` in the chunk string.
- **Global offsets:** In `pipeline.ts`, lexicon findings are inserted with **`start_offset_global: null` and `end_offset_global: null`**. So **lexicon findings do not currently have global offsets** and will not participate in offset-based highlighting in the viewer (see Gaps).

---

## 4) How lexicon becomes findings

### Pipeline stage

- **File:** `apps/worker/src/pipeline.ts`, function `processChunkJudge`.
- **Order:** Lexicon runs **first** (before Router/Judge). Then Router → Judge (full chunk + micro-windows) → verbatim filter → dedupe → overlap → insert AI findings.

### Which terms produce findings?

- **Mandatory:** Terms with `enforcement_mode === 'mandatory_finding'` are turned into **findings** and inserted into `analysis_findings` with `source: 'lexicon_mandatory'`.
- **Soft signals:** Terms with `enforcement_mode === 'soft_signal'` are returned by `analyzeLexiconMatches` as `softSignals` but **are not inserted** and are **not** passed to the Judge or anywhere else. They are effectively unused in the current pipeline.

### Where `source` is set

- In `pipeline.ts` (around 185–219), for each `mandatoryFindings` item a row is built with `source: "lexicon_mandatory"` and upserted into `analysis_findings` with `onConflict: "job_id,evidence_hash"`, `ignoreDuplicates: true`.
- `evidence_hash` = `lexiconEvidenceHash(jobId, articleId, term.term, line_start)` (see `apps/worker/src/hash.ts`).

### Fields set on lexicon findings

- `job_id`, `script_id`, `version_id`, `source: 'lexicon_mandatory'`, `article_id` (from term `gcam_article_id`), `atom_id` (from term `gcam_atom_id`), `severity` (from term `severity_floor`), `confidence: 1`, `title_ar`, `description_ar`, `evidence_snippet`, **`start_offset_global: null`**, **`end_offset_global: null`**, `start_line_chunk`, `end_line_chunk`, `location: {}`, `evidence_hash`.

---

## 5) Caching / freshness

### Where cache lives

- **In-process in the worker:** `apps/worker/src/lexiconCache.ts` holds an in-memory array `cache: LexiconTerm[]`. No DB materialized view; no shared cache.

### When it is loaded and refreshed

- **Initial load:** On worker startup, `initializeLexiconCache(supabase)` is called (`apps/worker/src/index.ts`), which calls `refresh()` then `startAutoRefresh()`.
- **Refresh interval:** `config.LEXICON_REFRESH_MS` = **2 minutes** (see `apps/worker/src/config.ts`).
- **Refresh query:** `slang_lexicon` where `is_active = true`, ordered by `term`.

### When a new term affects results

- **Next “Start Smart Analysis”:** New jobs are processed by the worker, which uses the **current in-memory cache** at the time each chunk is processed. So a term added **after** the worker has started will appear in the cache at most **2 minutes** later (or on next worker restart).
- **Already-running job:** Chunks are processed with the cache as of the time they are processed. If the cache refreshes mid-job, later chunks may see the new term; no explicit invalidation per job.

### Invalidation

- **No TTL** other than the 2-minute refresh.
- **No explicit “refresh lexicon” API** for the worker.
- **Worker restart** reloads the cache from DB.

---

## 6) What the user should expect

### Report findings list

- Lexicon mandatory findings are stored in `analysis_findings` with `source = 'lexicon_mandatory'`. They are returned by **GET /findings?jobId=...** like any other finding and appear in the report/findings list. The UI shows a “Lexicon” (قاموس) badge for `source === 'lexicon_mandatory'` (e.g. `ScriptWorkspace.tsx`, `FindingCard.tsx`).

### Highlights in viewer

- Highlighting uses `startOffsetGlobal` and `endOffsetGlobal`. Lexicon findings are currently inserted with **null** global offsets, so they **will not** be highlightable in the script viewer until the pipeline sets global offsets (e.g. `chunkStart + match.startIndex`, `chunkStart + match.endIndex`).

### Severity / article on finding card

- Severity and article come from the finding row: `severity`, `article_id`, `atom_id` (and any title/description fields). They are displayed like other findings; no special handling for lexicon beyond the source badge.

---

## Flow diagram (bullet)

```
[User: Glossary page]
  → list: GET /lexicon/terms → Edge Function (stub) → []  ⇒  UI shows 0 terms (unless mock)
  → add/edit/deactivate: POST or PUT /lexicon/terms → 501 (stub)

[Worker]
  → startup: initializeLexiconCache() → SELECT slang_lexicon WHERE is_active = true → in-memory cache
  → every 2 min: refresh() → same SELECT → update cache

[User: Start Smart Analysis]
  → POST /tasks { versionId } → analysis_job + chunks created
  → Worker polls, processes chunks:
       for each chunk:
         1) analyzeLexiconMatches(chunkText) → mandatoryFindings (and unused softSignals)
         2) for each mandatory finding → upsert analysis_findings (source = 'lexicon_mandatory', start/end_offset_global = null)
         3) Router → Judge → verbatim → dedupe → overlap → upsert AI findings
  → Aggregation → analysis_reports updated

[User: Report / Highlights]
  → GET /findings?jobId=... → analysis_findings (includes lexicon_mandatory)
  → Findings list: shows Lexicon badge, severity, article
  → Highlights: only findings with non-null startOffsetGlobal/endOffsetGlobal; lexicon has null ⇒ no highlight for lexicon
```

---

## File list (read-only audit)

| File | Role |
|------|------|
| `apps/web/src/pages/Glossary.tsx` | Glossary UI, filters, modals (add/edit, history); uses dataStore.lexiconTerms. |
| `apps/web/src/api/index.ts` | lexiconApi: getTerms, addTerm, updateTerm, deactivateTerm, getHistory. |
| `apps/web/src/api/models.ts` | LexiconTerm, LexiconHistoryEntry, Finding.source. |
| `apps/web/src/store/dataStore.ts` | lexiconTerms state, fetchInitialData(getTerms), addLexiconTerm, updateLexiconTerm, deactivateLexiconTerm, importLexiconTerms. |
| `apps/web/src/api/httpClient.ts` | Mock handlers for /lexicon (mockDb.lexiconTerms, lexiconHistory). |
| `supabase/functions/lexicon/index.ts` | Stub: GET returns [], POST/PUT return 501. |
| `supabase/migrations/0001_init.sql` | slang_lexicon, slang_lexicon_history, triggers. |
| `apps/worker/src/lexiconCache.ts` | Load from slang_lexicon, findMatches (word/phrase/regex), 2-min refresh. |
| `apps/worker/src/lexiconMatcher.ts` | analyzeLexiconMatches → mandatoryFindings + softSignals. |
| `apps/worker/src/pipeline.ts` | processChunkJudge: lexicon first, then Router/Judge; inserts lexicon rows with null global offsets. |
| `apps/worker/src/hash.ts` | lexiconEvidenceHash. |
| `apps/worker/src/config.ts` | LEXICON_REFRESH_MS. |
| `apps/worker/src/index.ts` | initializeLexiconCache on startup. |
| `supabase/functions/findings/index.ts` | GET /findings?jobId= returns analysis_findings (includes source, start_offset_global, end_offset_global). |

---

## Exact matching rules (worker)

- **Word:** Regex from `term`: escaped literally, then wrapped in word-boundary pattern `(?<!\p{L})...(!?\p{L})` (or fallback). Matches whole “word” only, Unicode letters.
- **Phrase:** Regex from escaped `term` with flags `gi`: case-insensitive substring.
- **Regex:** User pattern with flags `gui`: case-insensitive, Unicode. Invalid regex is skipped (no finding).

No Arabic-specific normalization (no diacritics, kashida, or alef/yaa normalization).

---

## Gaps / bugs

1. **Lexicon Edge Function is a stub**  
   - GET /lexicon/terms returns `[]`, POST/PUT return 501. So with the real API, the Glossary page always shows 0 terms and cannot add/edit.  
   - **Fix:** Implement the lexicon Edge Function to read/write `slang_lexicon` (and optionally `slang_lexicon_history`) with proper auth and normalization (e.g. severity_floor to lowercase).

2. **Lexicon findings have null global offsets**  
   - In `pipeline.ts`, lexicon rows are inserted with `start_offset_global: null`, `end_offset_global: null`. So lexicon findings never get script-viewer highlights.  
   - **Fix:** Set `start_offset_global: chunkStart + m.match.startIndex`, `end_offset_global: chunkStart + m.match.endIndex` when building the lexicon row (and ensure chunk offsets are global in the canonical text).

3. **Soft signals unused**  
   - `analyzeLexiconMatches` returns `softSignals` but the pipeline does not insert them or pass them to the Judge. So “soft” terms have no effect.  
   - Optional: Either document as “informational only” or wire soft signals into the Judge prompt or a separate review list.

4. **Import/Export CSV not implemented**  
   - Glossary page has Import/Export CSV buttons with no handlers.  
   - Optional: Implement CSV import (validate + call addTerm or bulk insert) and export (getTerms → CSV download).

5. **Severity case**  
   - DB: `severity_floor` CHECK lowercase. UI form: e.g. `'Medium'`. If the Edge Function is implemented, normalize to lowercase before insert/update to avoid constraint errors.

6. **Possible “0 terms” despite DB data**  
   - With the stub, the UI always gets `[]`. Once the API is implemented, the page will show terms from `slang_lexicon`. No other client-side bug identified for “empty list when DB has rows” once the API returns data.

---

## Optional minimal fix (lexicon highlights)

To make lexicon findings highlightable like AI findings:

In `apps/worker/src/pipeline.ts`, when building the lexicon row for each `m` in `mandatoryFindings`, set:

- `start_offset_global: chunkStart + m.match.startIndex`
- `end_offset_global: chunkStart + m.match.endIndex`

and keep the rest of the row (source, evidence_hash, etc.) as today. Then ensure the viewer and report list use `startOffsetGlobal`/`endOffsetGlobal` for lexicon the same way as for AI findings (they already come from the same `analysis_findings` row).
