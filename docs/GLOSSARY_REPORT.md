# Glossary (Slang Lexicon) — Complete Report

**Purpose of this document:** In-depth explanation of the current Glossary feature: what it is, what exists today, what works and what does not, and how it connects to the analysis pipeline. Use this to decide your plan (e.g. implement API, fix highlights, add CSV, etc.).

---

## 1. What the Glossary Is

The **Glossary** (Slang Lexicon Management) is the feature where admins/regulators define **forbidden or sensitive terms** (words, phrases, or regex patterns) that the system should treat as content violations when found in scripts.

- **User-facing name:** Lexicon Management (قاموس المصطلحات).
- **Who can use it:** Only users with role **Super Admin**, **Admin**, or **Regulator**. Others see an “Access denied” message.
- **Intent:**
  - **Mandatory terms:** “If this appears in the script → it is a violation.” The analysis worker creates a finding automatically.
  - **Soft terms:** Intended as hints (e.g. for the AI Judge or review). In the current code they are **not used** anywhere.

So in theory: add a word or sentence in the Glossary, mark it mandatory → next analysis treats it as “find this → violation.” In practice, **you cannot add terms from the UI today** because the backend that the Glossary calls is not implemented (see below).

---

## 2. Current Situation — Executive Summary

| Aspect | Status | Short explanation |
|--------|--------|-------------------|
| **Database** | ✅ Ready | Tables `slang_lexicon` and `slang_lexicon_history` exist with correct schema and triggers. |
| **Worker (analysis)** | ✅ Works | Reads from DB, matches script text, creates findings for **mandatory** terms. |
| **Glossary UI** | ✅ Built | Full page: list, add/edit modal, deactivate, filters, history modal, Import/Export buttons. |
| **Glossary API (Edge Function)** | ❌ Stub | GET returns empty list; POST/PUT return 501. So the UI cannot list or save real data when using the real API. |
| **Mock mode** | ✅ Works | If `VITE_USE_MOCK_API=true`, the app uses in-memory mock data for `/lexicon`; add/edit/delete “work” in the session but nothing is persisted to DB. |
| **Lexicon findings in report** | ✅ Shown | Mandatory matches appear in the findings list with a “Lexicon” badge. |
| **Lexicon highlights in script viewer** | ❌ Missing | Findings are stored with `start_offset_global` / `end_offset_global` = null, so they are not highlightable. |
| **Soft signals** | ❌ Unused | Computed by the worker but never turned into findings or passed to the Judge. |
| **Import/Export CSV** | ❌ Not implemented | Buttons exist but have no click handlers. |
| **History (audit)** | ⚠️ Partial | DB has history table + trigger; API has GET history endpoint (stub returns []). History is never loaded in the UI (no call to load history when opening the modal). |

**Bottom line:** The data model and analysis pipeline are in place. The **only way** to have the system “consider” a new word/sentence as a violation today is to **insert it directly into the database** (`slang_lexicon`). The Glossary **page** is built but cannot read or write real data until the **lexicon Edge Function** is implemented.

---

## 3. What We Have — In Depth

### 3.1 Database

**Location:** `supabase/migrations/0001_init.sql`

**Table: `slang_lexicon`**

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `term` | text | The actual word/phrase/regex (NOT NULL) |
| `normalized_term` | text | UNIQUE; typically `term.trim().toLowerCase()` for duplicate check |
| `term_type` | text | `'word'` \| `'phrase'` \| `'regex'` |
| `category` | text | e.g. profanity, sexual, violence, drugs (NOT NULL) |
| `severity_floor` | text | `'low'` \| `'medium'` \| `'high'` \| `'critical'` — **must be lowercase** in DB |
| `enforcement_mode` | text | `'soft_signal'` \| `'mandatory_finding'` |
| `gcam_article_id` | int | GCAM article number (NOT NULL) |
| `gcam_atom_id` | text | Optional sub-article |
| `gcam_article_title_ar` | text | Optional Arabic title |
| `description` | text | Optional |
| `example_usage` | text | Optional |
| `is_active` | boolean | Default true; “delete” = set false |
| `created_by` | uuid | FK to auth.users |
| `created_at` / `updated_at` | timestamptz | Auto |

Indexes: `is_active`, `category`, `enforcement_mode`. No case-insensitive unique on `term`; uniqueness is via `normalized_term`.

**Table: `slang_lexicon_history`**

- Audit log: one row per INSERT/UPDATE/DELETE on `slang_lexicon`.
- Columns: `id`, `lexicon_id`, `operation` (INSERT/UPDATE/DELETE), `old_data`, `new_data` (jsonb), `changed_by`, `changed_at`, `change_reason`.
- Filled by a trigger; no application code needed for logging.

So: **we have a complete, production-ready schema.** Any row in `slang_lexicon` with `is_active = true` is used by the worker.

---

### 3.2 Glossary UI (Frontend)

**Location:** `apps/web/src/pages/Glossary.tsx`

**What’s there:**

- **Access control:** Renders only for Super Admin / Admin / Regulator; others see “Access denied”.
- **Stats cards:** Total terms, count of soft signals, count of mandatory terms (from current `lexiconTerms` in store).
- **Filters:** Search (term/description/article title), category, severity, enforcement mode.
- **Table:** Term, type (word/phrase/regex), category, severity, enforcement mode, article (المادة X), actions (History, Edit, Delete).
- **Add term:** Button opens `TermModal` with empty form.
- **Edit:** Opens same modal with existing term; submit calls `updateLexiconTerm`.
- **Delete (deactivate):** Confirmation then `deactivateLexiconTerm(id, changedBy, reason)`.
- **History:** Button opens `HistoryModal`; it shows `lexiconHistory` from the store filtered by term id. **The store never loads history** (not in `fetchInitialData`; no `getHistory(id)` call when opening the modal), so with real API the history list would always be empty unless you add a call to load history when opening the modal.
- **Import CSV / Export CSV:** Buttons only; no `onClick` handlers.

**Form fields (add/edit):** Term, term type (word/phrase/regex), category, severity (Low/Medium/High/Critical), enforcement mode (soft/mandatory), GCAM article id, atom id, article title (AR), description, example usage. Duplicate check: same `normalized_term` among active terms.

**Data flow:** The page uses **only the store**: `lexiconTerms`, `addLexiconTerm`, `updateLexiconTerm`, `deactivateLexiconTerm`. It does not call the API directly. The store in turn calls `lexiconApi.getTerms()`, `lexiconApi.addTerm()`, etc.

**Store:** `apps/web/src/store/dataStore.ts`

- `lexiconTerms` and `lexiconHistory` are state.
- `fetchInitialData()` runs on app load and calls `lexiconApi.getTerms()` → result is stored in `lexiconTerms`. With real API this is always `[]` (stub).
- `addLexiconTerm(term)` → `lexiconApi.addTerm(term)` → 501 with real API.
- `updateLexiconTerm(id, updates, changedBy, reason)` → `lexiconApi.updateTerm(...)` → 501.
- `deactivateLexiconTerm(id, changedBy, reason)` → `lexiconApi.deactivateTerm(...)` → 501.
- `importLexiconTerms(terms)` → loops `addTerm` then `getTerms()` → with real API all fail.

So: **UI and store are complete and correct.** They are only limited by the API.

**API client:** `apps/web/src/api/index.ts`

- `lexiconApi.getTerms()` → GET `/lexicon/terms`
- `lexiconApi.addTerm(term)` → POST `/lexicon/terms`
- `lexiconApi.updateTerm(id, updates, changedBy, reason)` → PUT `/lexicon/terms/:id`
- `lexiconApi.deactivateTerm(id, changedBy, reason)` → PUT `/lexicon/terms/:id` (with `is_active: false`)
- `lexiconApi.getHistory(id)` → GET `/lexicon/history/:id`

When `VITE_USE_MOCK_API === 'true'`, `apps/web/src/api/httpClient.ts` intercepts `/lexicon` and uses `mockDb.lexiconTerms` and `mockDb.lexiconHistory` (in-memory). So with mock, the Glossary “works” for the session; with real API it does not.

---

### 3.3 Backend API (Edge Function)

**Location:** `supabase/functions/lexicon/index.ts`

**Current behavior (stub):**

- CORS and auth are applied (`requireAuth`).
- GET `/lexicon` or GET `/lexicon/terms` → returns `[]`.
- GET `/lexicon/history/:id` → returns `[]`.
- POST `/lexicon` or POST `/lexicon/terms` → returns `{ error: "Not implemented" }` with status **501**.
- PUT `/lexicon/terms/:id` → same 501.

So: **no reads from DB, no writes to DB.** The Glossary UI, when using the real API, always sees zero terms and cannot create or update anything.

---

### 3.4 Worker (Analysis Pipeline)

**How the worker uses the glossary:**

- **Does not use the Edge Function.** It uses the **Supabase client with service role** and reads directly from the table `slang_lexicon`.

**Cache:** `apps/worker/src/lexiconCache.ts`

- On startup, `initializeLexiconCache(supabase)` runs (`apps/worker/src/index.ts`).
- Loads all rows with `is_active = true` from `slang_lexicon`, ordered by `term`, into an **in-memory array**.
- Refreshes every **2 minutes** (`LEXICON_REFRESH_MS` in `config.ts`).
- No TTL, no “refresh” API; only periodic refresh and restart.

**Matching:** `apps/worker/src/lexiconMatcher.ts` + `lexiconCache.ts`

- For each analysis **chunk**, `processChunkJudge` calls `analyzeLexiconMatches(chunkText, supabase)`.
- Matching is **per chunk** (chunk text), not over the full script in one go.
- By `term_type`:
  - **word:** Word-boundary regex (Unicode `\p{L}`), so the term is matched as a whole word only.
  - **phrase:** Regex from escaped term with flags `gi` → case-insensitive substring.
  - **regex:** User pattern with flags `gui` (Unicode, case-insensitive). Invalid regex is skipped.
- **No Arabic normalization** (no diacritics, kashida, alef/yaa normalization). Text is matched as-is.
- Each match has chunk-relative `startIndex` and `endIndex` (and line/column).

**Findings:** `apps/worker/src/pipeline.ts`

- Only terms with `enforcement_mode === 'mandatory_finding'` produce findings.
- For each mandatory match, a row is inserted into `analysis_findings` with:
  - `source: 'lexicon_mandatory'`
  - `article_id`, `atom_id`, `severity` from the term
  - `evidence_snippet` = matched text
  - `start_offset_global: null`, `end_offset_global: null` ← **so no highlights in the script viewer**
  - `start_line_chunk`, `end_line_chunk` set
  - `evidence_hash` for deduplication (job + article + term + line)
- **Soft signals** are returned by `analyzeLexiconMatches` but **are not written to DB and are not passed to the Judge**. They have no effect today.

So: **if a term is in the DB (e.g. inserted by SQL) and is mandatory, the worker will create a lexicon finding.** The only way to get terms into the DB from the product today is outside the Glossary UI (e.g. SQL or a future real API).

---

### 3.5 How Lexicon Findings Appear to the User

- **Findings list (report):** Fetched via GET `/findings?jobId=...` from `analysis_findings`. Rows with `source = 'lexicon_mandatory'` are returned like any other finding. The UI shows a “Lexicon” (قاموس) badge and severity/article as for other findings.
- **Highlights in script viewer:** The viewer uses `startOffsetGlobal` and `endOffsetGlobal`. For lexicon findings these are null, so **lexicon matches are not highlightable** in the script.

---

## 4. End-to-End Flow (What Exists Today)

```
[Admin opens Glossary]
  → fetchInitialData() → GET /lexicon/terms
  → Real API: Edge Function returns []  ⇒  page shows 0 terms
  → Mock API: httpClient returns mockDb.lexiconTerms  ⇒  page shows mock data

[Admin clicks Add Term and submits]
  → addLexiconTerm(term) → POST /lexicon/terms
  → Real API: 501  ⇒  nothing saved
  → Mock API: push into mockDb.lexiconTerms  ⇒  “saved” in memory only

[Admin runs Smart Analysis on a script]
  → Job + chunks created. Worker picks chunks.
  → Worker: lexicon cache = SELECT slang_lexicon WHERE is_active = true (at startup / last 2‑min refresh)
  → For each chunk: analyzeLexiconMatches(chunkText) → mandatory findings
  → Each mandatory match → INSERT analysis_findings (source = lexicon_mandatory, offsets = null)
  → Rest of pipeline (Router, Judge, etc.) runs as usual

[Admin opens report]
  → GET /findings?jobId=...  ⇒  includes lexicon_mandatory rows
  → Findings list: Lexicon badge + severity + article
  → Script viewer: no highlight for lexicon (offsets null)
```

---

## 5. Gaps and Implications

| Gap | Impact | Fix (for your plan) |
|-----|--------|----------------------|
| **Lexicon Edge Function is a stub** | Glossary always shows 0 terms; add/edit/delete do nothing with real API. | Implement CRUD in `supabase/functions/lexicon/index.ts`: read/write `slang_lexicon`, optionally write/read `slang_lexicon_history`. Normalize `severity_floor` to lowercase before insert/update. |
| **Lexicon findings have null global offsets** | Lexicon violations cannot be highlighted in the script viewer. | In `pipeline.ts`, set `start_offset_global = chunkStart + match.startIndex`, `end_offset_global = chunkStart + match.endIndex` when building the lexicon finding row. |
| **Soft signals unused** | “Soft” terms have no effect on findings or Judge. | Either document as “reserved for future use” or implement: e.g. pass soft matches to Judge prompt or create a separate “review” list. |
| **Import/Export CSV** | Buttons do nothing. | Add handlers: Import = parse CSV, validate, then add terms (or bulk insert via API); Export = getTerms → download CSV. |
| **History not loaded in UI** | History modal always shows empty (store’s `lexiconHistory` is never filled from API; stub returns [] anyway). | When opening History modal, call `lexiconApi.getHistory(termId)` and store result (e.g. in store or local state). When API is implemented, ensure GET `/lexicon/history/:id` returns rows from `slang_lexicon_history`. |
| **Severity case** | DB expects lowercase (`low`, `medium`, …); form uses capitalized (`Medium`, etc.). | When implementing the Edge Function, normalize severity to lowercase before insert/update to avoid CHECK constraint errors. |

---

## 6. File Reference (Quick Index)

| Area | File(s) |
|------|--------|
| DB schema | `supabase/migrations/0001_init.sql` (slang_lexicon, slang_lexicon_history, triggers) |
| Glossary page | `apps/web/src/pages/Glossary.tsx` |
| Store | `apps/web/src/store/dataStore.ts` (lexiconTerms, fetchInitialData, add/update/deactivate/import) |
| API client | `apps/web/src/api/index.ts` (lexiconApi), `apps/web/src/api/models.ts` (LexiconTerm, LexiconHistoryEntry) |
| Mock | `apps/web/src/api/httpClient.ts` (USE_MOCK_API, /lexicon handlers) |
| Edge Function | `supabase/functions/lexicon/index.ts` (stub) |
| Worker cache | `apps/worker/src/lexiconCache.ts` |
| Worker matching | `apps/worker/src/lexiconMatcher.ts` |
| Worker pipeline | `apps/worker/src/pipeline.ts` (lexicon step + insert with null offsets) |
| Worker config | `apps/worker/src/config.ts` (LEXICON_REFRESH_MS) |
| Findings API | `supabase/functions/findings/index.ts` (GET findings for job) |

---

## 7. Summary Table — “If I add a word today?”

| Question | Answer |
|----------|--------|
| Can I add it from the Glossary UI? | **No.** Real API returns 501; nothing is saved. (With mock, it’s in-memory only.) |
| If I add it via SQL to `slang_lexicon`? | **Yes.** Worker will use it within 2 minutes (or on next restart). Mandatory terms → automatic violation findings. |
| Will it show in the report? | **Yes**, for mandatory terms: as a finding with “Lexicon” badge, severity, and article. |
| Will it show as a highlight in the script? | **No.** Lexicon findings have null global offsets; the viewer only highlights when offsets are set. |
| Do “soft” terms do anything? | **No.** They are matched but not stored or passed to the Judge. |

---

You can use this report to plan: e.g. “Phase 1: implement lexicon Edge Function + normalize severity,” “Phase 2: set global offsets for lexicon findings,” “Phase 3: CSV + history loading,” etc. For detailed flow and matching rules, see `docs/GLOSSARY_LEXICON_FLOW.md`.
