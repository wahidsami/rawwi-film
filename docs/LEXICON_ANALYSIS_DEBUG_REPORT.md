# Lexicon / Glossary Terms Not Appearing in AI Analysis — Debug Report

**Goal:** Explain why newly-added glossary/lexicon terms do NOT appear in AI analysis results, with storage, worker load, pipeline usage, root-cause hypotheses, minimal fix, and verification.

---

## 1) Findings (bullet list)

- **Single source of truth:** Glossary terms are stored in **one** table, `slang_lexicon`. The UI writes via the **lexicon Edge Function** (Supabase Functions). The **worker** reads the same table via **Supabase client (service role)** — it does **not** call the Edge Function.
- **Edge Function is implemented** (not a stub): `supabase/functions/lexicon/index.ts` performs real CRUD on `slang_lexicon` and `slang_lexicon_history` using the admin client. The doc `docs/GLOSSARY_LEXICON_FLOW.md` is **outdated** (it still describes the Edge Function as returning `[]` and 501).
- **Worker lexicon load:** On startup the worker calls `initializeLexiconCache(supabase)` → `refresh()` then `startAutoRefresh()`. Refresh runs every **2 minutes** (hardcoded `LEXICON_REFRESH_MS = 2 * 60 * 1000` in `config.ts`; no env override). It queries **direct DB**: `slang_lexicon` where `is_active = true`, ordered by `term`. Credentials: **service role** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). No tenant/client filter; no use of Edge Function.
- **Lexicon in pipeline:** Lexicon runs **first** in `processChunkJudge` (before Router/Judge). It is **not** used for UI-only highlighting, search expansion, or router; it is used to **produce mandatory findings** from chunk text. Terms with `enforcement_mode === 'mandatory_finding'` become rows in `analysis_findings` with `source: 'lexicon_mandatory'`. `HIGH_RECALL` only bypasses the **router** (article selection); it does **not** skip lexicon.
- **“Count: 0” possible causes:** (1) Worker’s `SUPABASE_URL` points to a **different** Supabase project (e.g. local) than the one the UI/Edge Function use — so DB has terms in cloud, worker reads empty local DB. (2) **Refresh fails** (network, wrong URL, bad key) and the code returns early without updating the in-memory cache; then the cache stays empty or stale and we only see “Lexicon refresh failed” in logs, not “refreshed” with 0. (3) **Mock API:** If the web app runs with `VITE_USE_MOCK_API=true`, all `/lexicon` requests are handled in-memory by `mockFetch`; **nothing is persisted to the DB**, so the worker never sees new terms.
- **No schema drift:** Worker and Edge Function both use `slang_lexicon`; same columns (worker selects a subset). No separate “glossary” table for analysis.

---

## 2) Evidence (file paths + line numbers)

| What | Where |
|------|--------|
| **DB table** | `supabase/migrations/0001_init.sql` — table `slang_lexicon` (lines 186–203), `slang_lexicon_history` (216–226), triggers (229–249). RLS is OFF (line 2). |
| **Columns** | `id`, `term`, `normalized_term`, `term_type`, `category`, `severity_floor`, `enforcement_mode`, `gcam_article_id`, `gcam_atom_id`, `gcam_article_title_ar`, `description`, `example_usage`, `is_active`, `created_by`, `created_at`, `updated_at`. Indexes on `is_active`, `category`, `enforcement_mode`. |
| **Edge Function** | `supabase/functions/lexicon/index.ts`: GET list (81–92), GET history (95–109), POST term (112–177), PUT term (179–247). Uses `createSupabaseAdmin()` from `_shared/supabaseAdmin.ts` (service role). |
| **Worker config** | `apps/worker/src/config.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from env (5–6); `LEXICON_REFRESH_MS: 2 * 60 * 1000` (12) — **no env override**. |
| **Worker DB client** | `apps/worker/src/db.ts`: `createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)`. |
| **Worker lexicon load** | `apps/worker/src/lexiconCache.ts`: `refresh()` (51–78) — `.from("slang_lexicon").select(...).eq("is_active", true).order("term")`; on error logs and returns without updating cache (60–63). `startAutoRefresh()` (108–110) uses `config.LEXICON_REFRESH_MS`. |
| **Worker startup** | `apps/worker/src/index.ts`: `initializeLexiconCache(supabase)` (47) before processing; same in `runOnce()` (48). |
| **Pipeline usage** | `apps/worker/src/pipeline.ts`: `processChunkJudge` (193+) — first step is `analyzeLexiconMatches(chunkText, supabase)` (220); then mandatory findings are upserted into `analysis_findings` (261–293). `HIGH_RECALL` only at 340–343 (router bypass). |
| **Lexicon → findings** | `apps/worker/src/lexiconMatcher.ts`: `analyzeLexiconMatches` uses `getLexiconCache(supabase).findMatches(text)`; splits by `enforcement_mode` into `mandatoryFindings` and `softSignals`; only mandatory are used by pipeline. |
| **Web API + mock** | `apps/web/src/api/httpClient.ts`: `USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true'` (6); when true, `/lexicon` (277–296) is handled by `mockFetch` — GET returns `mockDb.lexiconTerms`, POST/PUT update in-memory only; **no request to Edge Function**. Real requests: `fetch(API_BASE_URL + url)` (375). |
| **Web API base** | `apps/web/src/lib/env.ts`: `API_BASE_URL = envUrl || (DEV ? "http://localhost:54321/functions/v1" : "")`; production requires `VITE_API_BASE_URL` (Supabase project’s Functions URL). |
| **Web store** | `apps/web/src/store/dataStore.ts`: `fetchInitialData` calls `lexiconApi.getTerms()` (55); `addLexiconTerm` / `updateLexiconTerm` / `deactivateLexiconTerm` call `lexiconApi.addTerm` / `updateTerm` / `deactivateTerm` (150, 158, 166). |

---

## 3) Root cause (most likely + why)

**Most likely: Worker and frontend use different Supabase projects (e.g. worker = local, frontend = cloud).**

- The **web app** in production uses `VITE_API_BASE_URL` (e.g. `https://<project-ref>.supabase.co/functions/v1`). Adding a term → Edge Function → writes to **that project’s** `slang_lexicon`.
- The **worker** uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from **its** env (e.g. `.env` or deployment env). If the worker is run locally or in an environment where `SUPABASE_URL` points to **local** Supabase (`http://127.0.0.1:54321`) or another project, it will read from that DB. So:
  - New terms exist in **cloud** `slang_lexicon`.
  - Worker reads **local** or **other** DB → empty or stale → “Lexicon cache refreshed” with `count: 0` or old data → new terms never produce findings.

**Second likely: Mock API in use.**

- If `VITE_USE_MOCK_API=true` in the build or at runtime, the UI never calls the real Edge Function. Terms “added” in the Glossary live only in `mockDb.lexiconTerms` in the browser; they are **never** written to any database. The worker only reads from the real DB, so it will never see those terms.

**Third: Refresh fails silently (no update to cache).**

- If the worker’s first refresh fails (wrong URL, network, invalid key), the code in `lexiconCache.ts` logs “Lexicon refresh failed” and returns **without** updating the in-memory cache. The cache then stays empty (or at previous value if any). So we see “count: 0” only when refresh **succeeds** and returns 0 rows; we see **no** “Lexicon cache refreshed” when refresh fails.

---

## 4) Fix plan (exact code changes, env vars, SQL, redeploy)

### 4.1 Align worker with production DB (primary)

- **Ensure worker env in production** uses the **same** Supabase project as the frontend:
  - `SUPABASE_URL` = project URL (e.g. `https://<project-ref>.supabase.co`)
  - `SUPABASE_SERVICE_ROLE_KEY` = that project’s service role key (Dashboard → Project Settings → API).
- If the worker runs in a separate service (e.g. Docker, Cloud Run), set these in that environment; do **not** rely on a local `.env` that points to local Supabase.
- **No SQL or code change** required if the only issue is env.

### 4.2 Disable mock API in production

- In production build, **do not** set `VITE_USE_MOCK_API=true`. Ensure the production env (e.g. in CI or hosting) does not pass this. So the UI always calls the real `API_BASE_URL` (Edge Function) and terms are written to `slang_lexicon`.

### 4.3 Optional: Env override for lexicon refresh interval

- In `apps/worker/src/config.ts`, allow override so you can shorten the refresh for debugging (e.g. 30s):

```ts
LEXICON_REFRESH_MS: parseInt(process.env.LEXICON_REFRESH_MS ?? String(2 * 60 * 1000), 10),
```

- Then set `LEXICON_REFRESH_MS=30000` in worker env if desired.

### 4.4 Diagnostic logging (already added)

- **lexiconCache.ts:** After a successful refresh, log `count`, `updated_at_max`, and first 3 terms (`first_terms`). On refresh error, log `error.message`, `code`, `hint`.
- **pipeline.ts:** When processing a chunk, if lexicon cache count is 0, log a warning with `jobId`, `chunkId`, `lexiconCount: 0`. In dev, log `lexiconCount` in the existing health-check line.

Use these logs to confirm:
- That refresh succeeds and which `count` / `updated_at_max` / `first_terms` the worker sees.
- That when “count: 0” appears, it comes from “Lexicon cache refreshed” (so DB returned 0 rows for that project) vs. “Lexicon refresh failed” (so worker never updated cache).

### 4.5 No SQL change

- Schema and table usage are correct; no migration needed for “new terms not appearing.”

### 4.6 Redeploy

- Redeploy the **worker** with the correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the production project.
- Redeploy the **web app** ensuring `VITE_USE_MOCK_API` is not `true` and `VITE_API_BASE_URL` points to the same project’s Functions URL.
- Ensure the **lexicon** Edge Function is deployed to that project (`supabase functions deploy lexicon`).

---

## 5) Verification checklist (API calls + expected outputs)

1. **Confirm Edge Function returns new term (production)**  
   - Call: `GET <API_BASE_URL>/lexicon/terms` with a valid Bearer token (or use Dashboard → Edge Function logs).  
   - Expected: 200, JSON array including the newly added term (same project as production DB).

2. **Confirm DB has the term**  
   - In Supabase Dashboard → SQL Editor (or `psql`), same project:  
     `SELECT id, term, normalized_term, is_active, updated_at FROM slang_lexicon ORDER BY updated_at DESC LIMIT 5;`  
   - Expected: New term with `is_active = true`.

3. **Confirm worker uses same project**  
   - Check worker logs for “Lexicon cache refreshed” right after startup and after ~2 minutes.  
   - Expected: `count >= 1`, `updated_at_max` recent, `first_terms` including the new term (or at least non-empty if you have other terms).  
   - If you see “Lexicon refresh failed”, check `error.message` / `code` / `hint` and fix URL/key/network.

4. **Confirm worker does not see empty cache when DB has terms**  
   - If DB has active terms but worker logs “Lexicon cache refreshed” with `count: 0`, worker is connected to a **different** DB (wrong `SUPABASE_URL`). Fix worker env.

5. **Confirm analysis produces lexicon findings**  
   - Run an analysis job on a script that contains the new term (exact string for phrase/word, or pattern for regex).  
   - Expected: Findings list includes an entry with `source: 'lexicon_mandatory'` and the expected term/severity. Worker logs may show “Lexicon finding upsert result” for that chunk.

6. **Optional: Shorten refresh for testing**  
   - Set `LEXICON_REFRESH_MS=30000`, restart worker, add a new term in the UI, wait 30s, run analysis. New term should appear in worker cache and in findings if it matches script text.

---

## Summary table

| Item | Location | Note |
|------|----------|------|
| **Storage** | `slang_lexicon` (and `slang_lexicon_history`) in Supabase | Single table; no RLS on slang_lexicon. |
| **UI → DB** | Edge Function `lexicon` (GET/POST/PUT) | Implemented; uses service role. |
| **Worker → DB** | Direct Supabase client, `slang_lexicon` WHERE `is_active = true` | Service role; 2 min refresh; no Edge Function. |
| **Lexicon in pipeline** | First step in `processChunkJudge`; mandatory terms → `analysis_findings` | Not skipped by HIGH_RECALL. |
| **Likely bug** | Worker `SUPABASE_URL` ≠ production project, or mock API used in prod | Align env; disable mock in prod. |
| **Diagnostics** | “Lexicon cache refreshed” (count, updated_at_max, first_terms); “Lexicon refresh failed”; “Lexicon cache empty for chunk” | Use to prove which DB worker sees and whether refresh fails. |
