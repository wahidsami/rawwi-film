# Glossary / Lexicon — End-to-End Verification

This document describes the **verified flow** from adding a term in the Glossary UI through to lexicon findings and highlights in ScriptWorkspace, with code paths, evidence expectations, limitations, and a QA checklist.

---

## 1. Verified flow: UI → API → DB → Worker → Findings → Highlighting

```
[Admin] Glossary page
    → Add term (e.g. zz_test_waheed_01, mandatory_finding, article 1)
    → Submit
    → POST /lexicon/terms (Edge Function)
    → Insert into slang_lexicon (normalized_term, severity_floor normalized, created_by)
    → Response 200 with saved row

[Admin] Refresh Glossary
    → fetchInitialData() → GET /lexicon/terms
    → Edge Function SELECT from slang_lexicon
    → Term still appears in list ✓

[Admin] Start Smart Analysis on a script that contains "zz_test_waheed_01"
    → POST /tasks { versionId }
    → tasks Edge Function: creates analysis_job + analysis_chunks from script_text.content (canonical)
    → Worker polls, picks job, loads lexicon cache (slang_lexicon WHERE is_active = true)
    → For each chunk: analyzeLexiconMatches(chunk.text) → mandatoryFindings
    → For each match: startGlobal = chunk.start_offset + match.startIndex, endGlobal = chunk.start_offset + match.endIndex
    → evidence_snippet = normalizedText.slice(startGlobal, endGlobal); location.context_before/after
    → INSERT analysis_findings (source = 'lexicon_mandatory', start_offset_global, end_offset_global, evidence_snippet, location)

[Admin] Open report for that job
    → GET /findings?jobId=... returns findings including lexicon_mandatory with non-null startOffsetGlobal, endOffsetGlobal

[Admin] ScriptWorkspace → select report → click "Show highlights in script"
    → reportFindings loaded; canonicalContentForHighlights = editorData.content (script_text.content)
    → Hash match: selectedJobCanonicalHash === editorData.contentHash (same version/canonical)
    → useEffect: validFindings = those with valid offsets and offsetValid(canonical, f)
    → For each: rangeFromNormalizedOffsets(domTextIndex, start, end) → range.surroundContents(span)
    → span has data-finding-id={f.id}, class ap-highlight
    → DOM contains [data-finding-id] count > 0 ✓
    → Console: [Highlights] DOM [data-finding-id] count: N, first few data-finding-ids: [...]
```

---

## 2. Code paths (files + key functions)

| Step | File(s) | Key function / route |
|------|--------|------------------------|
| **Glossary list / add** | `apps/web/src/pages/Glossary.tsx` | TermModal handleSubmit → addLexiconTerm(term) |
| **Store → API** | `apps/web/src/store/dataStore.ts` | fetchInitialData → lexiconApi.getTerms(); addLexiconTerm → lexiconApi.addTerm(term) |
| **API client** | `apps/web/src/api/index.ts` | lexiconApi.getTerms() GET /lexicon/terms; addTerm() POST /lexicon/terms |
| **Lexicon Edge Function** | `supabase/functions/lexicon/index.ts` | GET /lexicon/terms → select slang_lexicon; POST → insert (normalized_term, severity_floor, created_by); PUT → update, last_changed_by, last_change_reason |
| **DB** | `supabase/migrations/0001_init.sql`, `0023_lexicon_history_audit.sql` | slang_lexicon, slang_lexicon_history, trigger |
| **Job creation** | `supabase/functions/tasks/index.ts` | POST /tasks: script_text.content → normalized → chunkText() → analysis_jobs + analysis_chunks |
| **Worker startup** | `apps/worker/src/index.ts` | initializeLexiconCache(supabase) |
| **Lexicon cache** | `apps/worker/src/lexiconCache.ts` | refresh() SELECT slang_lexicon WHERE is_active; findMatches(text) word/phrase/regex |
| **Chunk processing** | `apps/worker/src/pipeline.ts` | processChunkJudge(): analyzeLexiconMatches(chunkText) → mandatoryFindings; startGlobal/endGlobal; evidence_snippet from canonical; upsert analysis_findings |
| **Findings API** | `supabase/functions/findings/index.ts` | GET /findings?jobId= → select analysis_findings, camelCase (startOffsetGlobal, endOffsetGlobal) |
| **ScriptWorkspace highlights** | `apps/web/src/pages/ScriptWorkspace.tsx` | useEffect [domTextIndex, canonicalContentForHighlights, reportFindings, canonicalHashMismatch]: validFindings filter → rangeFromNormalizedOffsets → surroundContents(span with data-finding-id) |
| **Highlight styling** | `apps/web/src/index.css` | .ap-highlight { background, outline, padding } |

---

## 3. Screenshot / console evidence expectations

### 3.1 Terms persist after refresh

- **Action:** Add a unique term (e.g. `zz_test_waheed_01`) in Glossary → Save → Refresh the page (F5 or reload).
- **Expectation:** The term still appears in the Glossary table.
- **DB check (SQL):**
  ```sql
  SELECT id, term, normalized_term, term_type, severity_floor, enforcement_mode, is_active, created_at
  FROM slang_lexicon
  WHERE term ILIKE '%zz_test_waheed_01%' OR normalized_term = 'zz_test_waheed_01';
  ```
  You should see one row with `is_active = true`, `normalized_term = 'zz_test_waheed_01'`, `severity_floor` in (low, medium, high, critical).

### 3.2 Report includes lexicon finding

- **Action:** Run Smart Analysis on a script whose canonical text contains the exact term (e.g. `zz_test_waheed_01`). Wait for job to complete. Open the report for that job.
- **Expectation:** The findings list includes at least one finding with:
  - **Source:** Lexicon (قاموس) badge
  - **evidence_snippet** containing the term
  - **start_offset_global** and **end_offset_global** non-null in API response (check Network tab: GET /findings?jobId=... → response items have startOffsetGlobal, endOffsetGlobal as numbers).

### 3.3 Elements search for `data-finding-id` is NOT 0/0 after Highlight

- **Action:** In ScriptWorkspace, select the script and the report that contains the lexicon finding. Click the control to “Show highlights in script” (or ensure the highlight report is selected).
- **Expectation:**
  - In browser DevTools → Elements, search for `data-finding-id`. You should see **at least one** match (and ideally one per finding that has valid offsets).
  - In Console (dev mode), you should see logs similar to:
    - `[Highlights] total=N applied=M ...`
    - `[Highlights] DOM [data-finding-id] count: M`
    - `[Highlights] first few data-finding-ids: ['uuid-1', 'uuid-2', ...]`
  - Visually: highlighted spans have red-tinted background and outline (`.ap-highlight` in `index.css`).

### 3.4 Worker cache refresh

- **Behavior:** Worker loads `slang_lexicon` at startup and refreshes in-memory cache every **2 minutes** (`LEXICON_REFRESH_MS` in `apps/worker/src/config.ts`).
- **To force new terms to be seen:** Restart the worker, or wait up to 2 minutes after adding the term before running Smart Analysis.

---

## 4. Known limitations

| Limitation | Description |
|------------|-------------|
| **Arabic normalization: none** | No normalization of أ/إ/آ, ى/ي, ة/ه, diacritics, or kashida. Terms must match script text exactly. The Glossary UI shows a warning to this effect. |
| **Overlapping findings** | When applying highlights, overlapping ranges are skipped (later range with start < lastEnd is not wrapped). One segment may show one finding only. |
| **Cache refresh** | New or updated terms are visible to the worker only after cache refresh (2 min) or worker restart. |
| **Canonical hash mismatch** | If the script text (script_text.content or editor content) has changed since the job was run, the highlight effect does not run (canonicalHashMismatch). User must re-run Smart Analysis. |
| **Soft signals** | Terms with enforcement_mode = soft_signal are matched but not inserted as findings and not passed to the Judge. |

---

## 5. QA checklist (regression testing)

Use this after any change that touches Glossary, lexicon API, worker pipeline, or ScriptWorkspace highlights.

- [ ] **Persistence:** Add a new term in Glossary (e.g. unique string like `zz_test_waheed_01`). Refresh the page. Term still appears.
- [ ] **DB:** Run the SQL above; row exists in `slang_lexicon` with correct normalized_term and is_active.
- [ ] **Worker:** After adding term, either wait ~2 min or restart worker. Run Smart Analysis on a script that contains the term. Job completes.
- [ ] **Finding:** Open report for that job. At least one finding has source Lexicon, non-null startOffsetGlobal/endOffsetGlobal, evidence_snippet containing the term.
- [ ] **Highlight:** In ScriptWorkspace, select that report and enable highlights. Elements search for `data-finding-id` returns > 0 matches. Console shows `[Highlights] DOM [data-finding-id] count:` > 0.
- [ ] **Visual:** Highlighted text is visibly styled (red tint/outline).
- [ ] **Deactivate:** In Glossary, deactivate the term. Next analysis does not create a lexicon finding for that term.
- [ ] **UX:** Glossary Add/Edit modal shows (1) Arabic normalization warning under the term field, (2) term_type helper text (word / phrase / regex) under the type dropdown.

---

## 6. Acceptance criteria (mapping)

| Criterion | Where verified |
|-----------|----------------|
| Adding unique term (e.g. `zz_test_waheed_01`) persists and survives refresh | § 3.1 + § 5 Persistence / DB |
| Smart Analysis on script containing it produces a lexicon finding in the report | § 3.2 + § 5 Finding |
| Finding has non-null global offsets and correct evidence_snippet | § 3.2 (GET /findings response) + pipeline evidence_snippet from canonical |
| Clicking Highlight results in visible highlights and DOM contains [data-finding-id] | § 3.3 + § 5 Highlight / Visual |
| UI explains term_type semantics and warns about Arabic normalization | § 5 UX + Glossary.tsx (helper text + Arabic warning) |
