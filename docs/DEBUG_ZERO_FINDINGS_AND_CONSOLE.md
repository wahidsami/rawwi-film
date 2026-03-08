# How to Debug Zero Findings & Console Errors

## 1. Browser console errors (403 on /users)

### What you saw
```
swbobhxyluupjzsxpzrd.supabase.co/functions/v1/users:1 Failed to load resource: 403
Failed to load users Error: Forbidden: manage_users or access_control:manage required
```

### Cause
When a **Regulator** opens **Client Details** (e.g. from Clients list), the page loads the users list for the “Assign to” dropdown. Regulators don’t have `manage_users`, so the `/users` API returns 403.

### Fix applied
- **ClientDetails** now catches 403 on `getUsers()` and, for regulators, fills the assignee dropdown with only the current user (so they can assign to themselves). No more console error for that case.

### Other console lines
- `lockdown-install.js`, `Mapify`, `feature_collector.js` come from **browser extensions**, not the app. You can ignore them or disable extensions when testing.

---

## 2. Zero findings – how to debug

Analysis can return 0 findings for several reasons. After redeploying, use **worker logs** to see what’s happening.

### Step 1: Get worker logs (Coolify)

1. Open **Coolify** and select the **worker** service (Raawi worker).
2. Open **Logs** (or **Deployments** → latest deployment → **Logs**).
3. Trigger **Smart Analysis** on the same script (as regulator or super admin).
4. Watch logs while the job runs (or copy a full run into a text file).

### Step 2: Search for debug lines

Search logs for **`[DEBUG]`**. You should see lines like:

```
[DEBUG] processChunkJudge started
  jobId: ...
  chunkId: ...
  chunkTextLength: 12345
  chunkStart: 0
  chunkEnd: 12345
  ALWAYS_CHECK_ARTICLES_count: 21
  ALWAYS_CHECK_ARTICLES_ids: [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]
```

Then:

```
[DEBUG] Articles passed to multi-pass
  selectedArticlesCount: 21
  selectedArticleIds: [4,5,...,24]
```

Then:

```
[DEBUG] runMultiPassDetection started
  chunkTextLength: ...
  allArticlesCount: 21
  allArticleIds: [4,5,...,24]
  lexiconTermsCount: ...
  passCount: 10
```

And after all passes:

```
Multi-pass detection completed
  totalFindings: ...
  afterDedup: ...
  passResults: [{ pass: 'glossary', findings: 0 }, { pass: 'insults', findings: 0 }, ...]
```

If there are still 0 findings:

```
[DEBUG] Multi-pass returned ZERO findings
  passBreakdown: [{ pass: 'glossary', count: 0 }, ...]
```

### Step 3: Interpret the logs

| What you see | Meaning |
|--------------|--------|
| `ALWAYS_CHECK_ARTICLES_count: 12` or missing 12–22 | Old worker code. Redeploy so `ALWAYS_CHECK_ARTICLES` uses `getScannableArticleIds()` (21 articles). |
| `selectedArticlesCount: 0` or `allArticlesCount: 0` | Router or pipeline is not passing articles. Check for errors above that line (e.g. Router failure). |
| `Pass skipped: no articles` for a pass name | That pass got 0 articles (e.g. wrong or empty `articleIds`). Check `articleIds` and that selected articles include the ones that pass needs. |
| `lexiconTermsCount: 0` | No active rows in `slang_lexicon`. Glossary pass will skip. Add terms in Glossary UI or DB. |
| All passes run, each `findings: 0` | Model returned no findings (e.g. prompt, model, or text issue). Check for OpenAI errors or rate limits earlier in the log. |
| `totalFindings: 5` but `afterDedup: 0` | Dedup removed everything (unusual). Check dedup logic. |
| No `[DEBUG]` lines at all | Worker code without the new logging. Ensure the latest commit is built and deployed in Coolify. |

### Step 4: Quick DB checks

**Script text present?**

```sql
SELECT id, version_number, length(extracted_text) AS len, extraction_status
FROM script_versions
WHERE script_id = 'YOUR_SCRIPT_ID'
ORDER BY version_number DESC
LIMIT 1;
```

If `len` is 0 or NULL, extraction failed (e.g. DOCX not extracted). Fix extraction first.

**Lexicon terms (for glossary pass)?**

```sql
SELECT term, gcam_article_id, severity_floor, is_active
FROM slang_lexicon
WHERE is_active = true
LIMIT 20;
```

If no rows, add terms (e.g. “نصاب”) via Glossary or SQL.

**Job and chunks created?**

```sql
SELECT aj.id, aj.status, aj.progress_done, aj.progress_total,
       (SELECT COUNT(*) FROM analysis_chunks WHERE job_id = aj.id) AS chunks
FROM analysis_jobs aj
WHERE aj.version_id = 'YOUR_VERSION_ID'
ORDER BY aj.created_at DESC
LIMIT 1;
```

If `chunks` = 0, chunking or job setup failed. Check worker logs for errors when the job is created and when chunks are enqueued.

---

## 3. Checklist before asking for more help

- [ ] Redeployed worker after the `ALWAYS_CHECK_ARTICLES` fix and latest debug logging.
- [ ] Confirmed in logs: `ALWAYS_CHECK_ARTICLES_count: 21` and `allArticleIds` includes 4–24.
- [ ] Confirmed in logs: `selectedArticlesCount` / `allArticlesCount` are 21 (not 0).
- [ ] Checked for `[DEBUG] Pass skipped: no articles` and noted which pass(es).
- [ ] Checked `lexiconTermsCount` (glossary pass needs terms).
- [ ] Checked DB: script version has non-empty `extracted_text`, job has chunks, and optionally some active `slang_lexicon` rows.
- [ ] Noted any OpenAI/API errors or rate limits in the same log window as the run.

If you can share a **snippet of worker logs** from one run (from “processChunkJudge started” through “Multi-pass detection completed” and any “[DEBUG]” / error lines), we can pinpoint why that run had 0 findings.
