# Code-Level: Prompts, Pipeline, Schemas, Lexicon, and Job States

This document provides an in-depth, code-level explanation of: (1) prompts and pipeline steps, (2) schemas for findings, overrides, report `summary_json` and `report_html`, (3) lexicon cache behavior (mandatory vs soft signal), and (4) job states and retry logic.

---

## 1. Prompts and Pipeline Steps

### 1.1 Overview

The analysis pipeline is **Router-lite → Judge-heavy**: a lightweight model selects relevant GCAM articles per chunk, then a heavier model checks the chunk against those articles’ atoms and outputs findings. Both use **Arabic system prompts** and return **JSON only** (`response_format: { type: "json_object" }`).

- **Router**: `worker/src/openai.ts` — `callRouter(chunkText, articleList)`.
- **Judge**: `worker/src/openai.ts` — `callJudge(chunkText, selectedArticles, chunkStartOffset, chunkEndOffset)`.
- **Repair**: `callRepairJson(model, brokenContent, context)` — used when Judge (or Router) returns invalid JSON; a separate repair prompt asks the model to fix the JSON.
- **Parsing/validation**: `worker/src/schemas.ts` — `parseRouterOutput`, `parseJudgeOutput`, Judge finding Zod schema.

**Environment**: `OPENAI_API_KEY`, `OPENAI_ROUTER_MODEL` (default `gpt-4.1-mini`), `OPENAI_JUDGE_MODEL` (default `gpt-4.1`). Timeout for chat: `JUDGE_TIMEOUT_MS = 120_000`.

---

### 1.2 Router Prompt (Article Selection)

- **Purpose**: Choose up to 8 most relevant articles from the full list (1–25), plus **always-include** articles from `worker/src/ruleset_gcam_full.ts`: `ALWAYS_CHECK_ARTICLES = [4,5,6,7,8,9,10,11,16,17,23,24]`. If the text contains profanity, insults, gender-based abuse, or threats, **must** add `[4,5,7,17]`.
- **System prompt** (`ROUTER_SYSTEM_AR`): Defines role as “ترشيحي فقط” (recommendation only). Lists violation override rule: if text contains سبّ، شتم، إهانة، إساءة قائمة على الجنس، عدائية لفظية أو تهديد → must add articles [4,5,7,17]. Output format: `{ "candidate_articles": [ { "article_id", "confidence" } ], "notes_ar": "optional" }`.
- **User content**: Built by `buildRouterArticlesPayload(articleList)` — one line per article “المادة N: title_ar”. Then chunk text (sliced to 15_000 chars). Then “أرجع JSON بقائمة candidate_articles.”
- **Parsing**: `extractJsonFromText(raw)` (first `{` to last `}`), then `JSON.parse`. Worker validates with `parseRouterOutput(routerRaw)` in `worker/src/schemas.ts` to get `candidate_articles` and merges with `ALWAYS_CHECK_ARTICLES` from `ruleset_gcam_full.ts`.

---

### 1.3 Judge Prompt (Atom Checking)

- **Purpose**: For a chunk and a set of **selected articles** (with full text and atoms), output **findings** (violations) with evidence and location.
- **System prompt** (`JUDGE_SYSTEM_AR`): Long Arabic prompt that defines:
  - **Phase 1 — Hard lexical scan**: Verbatim scan for profanity, insults, humiliation, gender-based language, etc. “وجود أي لفظ من أعلاه = لا يجوز إخراج findings فارغة.”
  - **Mandatory article binding**: e.g. سبّ/لفظ نابٍ → Article 4; لغة غير مناسبة → 5; إهانة → 17; إساءة للمرأة → 7; إيحاءات جسدية/جنسية → 4+23/24; عنف لفظي/تهديد → 4+9.
  - **Phase 2 — Explicit violation detection**: Violence, discrimination, sexual content, drugs/alcohol, dignity, incitement, etc.
  - **Phase 3 — Interpretive (soft) signals**: If no explicit violation, consider contextual signals; must use `severity = "low"` and `is_interpretive = true` with clear evidence.
  - **Strict prohibitions**: No suggestions, no “ينبغي”, no non-GCAM criteria.
  - **Evidence**: Every finding must have `evidence_snippet` (verbatim quote). If cannot quote verbatim → do not output violation.
  - **Zero-findings**: Allowed only if no risky language, no explicit violation, and no reasonable interpretive signal; in doubt → output soft signal.

**Output format** (in prompt):

```json
{
  "findings": [
    {
      "article_id": 4,
      "atom_id": "4.2",
      "title_ar": "...",
      "description_ar": "...",
      "severity": "medium",
      "confidence": 0.95,
      "is_interpretive": false,
      "evidence_snippet": "…",
      "location": {
        "start_offset": 123,
        "end_offset": 145,
        "start_line": 10,
        "end_line": 10
      }
    }
  ]
}
```

- **User content**: Built by `buildJudgeArticlesPayload(selectedArticles)` — for each article: “المادة N: title_ar\ntext_ar” and if atoms exist “  atom_id: text_ar” per line. Then “مقطع النص (start_offset=…، end_offset=…):” and chunk text (sliced to 30_000 chars). Then “أرجع JSON بمصفوفة findings.”
- **Parsing**: `extractJsonFromText(raw)` then `JSON.parse`. Worker validates with **JudgeFindingSchemaNew** (Zod): `article_id` 1–25, `atom_id` optional string, `severity` enum, `confidence` 0–1, `title_ar`/`description_ar` (with no-suggestion guard), `evidence_snippet`, `location` (start/end offset and line). If validation fails, worker calls **callRepairJson** with the raw string and a repair system prompt that describes the expected JSON shape; then re-parses and re-validates.

---

### 1.4 Repair JSON Prompt

- **When**: After Judge (or Router) returns a string that either is not valid JSON or fails Zod validation.
- **System prompt**: “You fix broken JSON. Return only valid JSON, no markdown, no explanation. Expected: { \"findings\": [ { \"article_id\", \"atom_id\", \"severity\", \"confidence\", \"title_ar\", \"description_ar\", \"evidence_snippet\", \"location\": { \"start_offset\", \"end_offset\", \"start_line\", \"end_line\" }, \"is_interpretive\" } ] }”
- **User**: “Broken JSON: … Return the corrected JSON only.” (content sliced to 8000 chars).

---

### 1.5 Pipeline Steps (Worker) — Per Chunk

High-level flow in `worker/src/index.ts` (`processChunkJudge`):

1. **Lexicon (pre-AI)**  
   - `analyzeLexiconMatches(chunkText, supabase)`  
   - Splits matches into **mandatoryFindings** and **softSignals**; builds **contextForLLM** (currently **not** injected into Judge user content in the codebase — see lexicon section).  
   - Mandatory findings are converted to a list of insertable objects (article_id, atom_id, severity, explanation, evidence_snippet, line_start/end).

2. **Router**  
   - `callRouter(chunkText, getScriptStandardRouterList())`  
   - `parseRouterOutput(routerRaw)` → candidate article IDs.  
   - Merge with `ALWAYS_CHECK_ARTICLES`; load full `GCAMArticle[]` for each id via `getScriptStandardArticle(id)` (scannable only).  
   - If router throws, fallback: use only `ALWAYS_CHECK_ARTICLES`.

3. **Judge — Pass A (full chunk)**  
   - `callJudge(chunkText, selectedArticles, chunkStartOffset, chunkEndOffset)`.  
   - If parse/validation fails → `callRepairJson` then re-validate.  
   - Output → list of **JudgeFinding** with chunk-relative location; worker converts to **global** offsets using chunk’s start/end.

4. **Verbatim validation**  
   - For each finding, check that `evidence_snippet` appears **verbatim** in the chunk text (`isVerbatim(sourceText, snippet)`).  
   - If not, drop the finding and increment `droppedNonVerbatim`.

5. **Micro-windows (Pass B)**  
   - If the chunk is long, `buildMicroWindows` may produce sub-windows; for each window, `callJudge(w.windowText, selectedArticles, w.globalStart, w.globalEnd)` and again repair if needed.  
   - Window findings are converted to global offsets and merged into the same list.

6. **Merge and dedupe**  
   - **dedupeByHash**: By `evidenceHash(article_id|atom_id|startGlobal|endGlobal|evidence_snippet)`; keep one per hash (prefer higher severity, then confidence, then non-interpretive).  
   - **overlapCollapse**: For same article_id+atom_id, if two findings overlap > 70% (by offset), keep the stronger one (severity, then confidence).

7. **Insert findings**  
   - **First**: Insert **lexicon mandatory** findings into `raawi_analysis_findings` (evidence_hash = `sha256(jobId:lexicon:article_id:term:line_start)` to avoid duplicates).  
   - **Then**: Insert AI findings; for each, `evidence_hash = evidenceHash(finding, start_offset_global, end_offset_global)`. Skip if `findingExistsByHash(job_id, h)`.  
   - Chunk status → `"done"`; `incrementJobProgress(job_id)`.

8. **Soft signals**  
   - Lexicon soft signals are collected into `softSignalsForReport` (term, line, severity, article_id, context).  
   - In the current worker, these are **not** persisted to a chunk_results table; aggregation receives an **empty** `lexiconSignals` array when building `summary_json`, so `summary_json.lexicon_signals` is not populated by the worker. (The Edge Function **raawi-generate-report** can still produce its own report with different data.)

9. **Ready for aggregation**  
   - After each chunk is processed (or failed), worker checks `jobHasActiveChunks(jobId)` — no chunk in `pending` / `routing` / `judging`.  
   - If none, `runAggregationForJob(jobId)` is called.

---

### 1.6 Ingest Pipeline (Edge Function)

- **Entry**: `supabase/functions/raawi-job-ingest/index.ts`.

- **Input**: `{ job_id }`.  
- **Precondition**: Job must be in `status = 'queued'` (else 409).  
- **Resolve script text**:  
  - **Branch A (version-based)**: If job has `script_version_id`, load version → get text from `extracted_text`, or `extracted_text_path` (storage), or from raw file at `storage_path` (DOCX/PDF extraction in Edge).  
  - **Branch B (legacy)**: Else load `raawi_scripts` by `script_id` → use `script_content` or fetch from `upload_file_url` and extract (DOCX/PDF).  
- **Normalize**: `normalizeText(rawText)`.  
- **Chunk**: `chunkText(normalized)` from `_shared/textExtract.ts` (max chunk size ~12k chars, overlap ~800).  
- **Persist**:  
  - Update job: `normalized_text = normalized`.  
  - Insert rows into `raawi_analysis_chunks`: `job_id`, `chunk_index`, `text`, `start_offset`, `end_offset`, `start_line`, `end_line`, `status: "pending"`.  
- **Job update**: `progress_total = chunks.length + 1`, `progress_done = 0`, `status = "queued"`, `script_content_hash = SHA256(normalized)`.  
- **Version metadata**: If `script_version_id`, set version’s `is_analyzed`, `integrity_status` as needed.  
- **Events**: INGEST_STARTED, INGEST_TEXT_EXTRACTED, CHUNKS_CREATED (or JOB_FAILED on error).

---

## 2. Schemas: Findings, Overrides, summary_json, report_html

### 2.1 raawi_analysis_findings (per-row schema)

Columns used in worker inserts and migrations:

| Column | Type | Source / meaning |
|--------|------|------------------|
| id | UUID | Default gen_random_uuid() |
| job_id | UUID | FK raawi_analysis_jobs(id) |
| chunk_id | UUID | FK raawi_analysis_chunks(id) (optional in some designs) |
| article_id | INT | GCAM article 1–25 |
| atom_id | TEXT | e.g. "4.2", "4.26.a" (nullable) |
| rule_id | INT | Backward compat; same as article_id for Article 4 (1..26) (nullable) |
| sub_id | TEXT | Backward compat; e.g. "26.a" (nullable) |
| severity | TEXT | low \| medium \| high \| critical |
| confidence | NUMERIC(5,4) | 0–1 |
| title | TEXT | English or short title |
| description | TEXT | Longer description |
| title_ar | TEXT | Arabic title from Judge or lexicon |
| description_ar | TEXT | Arabic description |
| evidence_snippet | TEXT | Verbatim quote from script |
| start_offset_global | INT | Offset in job’s normalized_text |
| end_offset_global | INT | End offset in normalized_text |
| start_line_chunk | INT | 1-based line in chunk |
| end_line_chunk | INT | 1-based line in chunk |
| location | JSONB | { start_offset, end_offset, start_line, end_line, is_interpretive? } |
| evidence_hash | TEXT | SHA256(article_id|atom_id|startGlobal|endGlobal|evidence_snippet) for dedupe; unique per job when not null (partial unique index) |

**Deduplication**: Insert skips if `findingExistsByHash(job_id, evidence_hash)`. Unique index on `(job_id, evidence_hash)` WHERE evidence_hash IS NOT NULL prevents duplicate hashes per job.

---

### 2.2 raawi_finding_overrides (event log)

Append-only; no UPDATE/DELETE (trigger raises).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| job_id | UUID | FK raawi_analysis_jobs(id) |
| script_id | UUID | FK raawi_scripts(id) |
| script_content_hash | TEXT | Version/content identity (e.g. SHA256 of normalized text) |
| stable_key_hash | TEXT | Finding identity: SHA256(article_id + atom_id + normalized_evidence + start_offset + end_offset) |
| finding_details | JSONB | Snapshot for audit: evidence_snippet_raw, evidence_snippet_norm, article_id, atom_id, location |
| event_type | TEXT | 'not_violation' \| 'hidden_from_owner' \| 'restored' |
| reason | TEXT | Length >= 10 |
| created_by | UUID | auth.users(id) |
| created_at | TIMESTAMPTZ | |

**Views**:  
- **raawi_effective_overrides**: DISTINCT ON (script_id, script_content_hash, stable_key_hash) order by created_at DESC → effective state per finding.  
- **raawi_owner_overrides_view**: Only `event_type = 'not_violation'` (owners do not see hidden_from_owner).

**Client**: Override “create” sends job_id, script_id, script_content_hash, stable_key_hash, finding_details, event_type, reason. Frontend computes stable_key_hash the same way as backend (article_id, atom_id, evidence_snippet, start_offset, end_offset). Report UI filters findings by effective override (e.g. hide “hidden_from_owner” from non-admin).

---

### 2.3 summary_json (structure)

Produced by `worker/src/aggregation.ts` → `buildSummaryJson(jobId, scriptId, findings, lexiconSignals)`. Returned shape:

```ts
{
  job_id: string;
  script_id: string;
  generated_at: string; // ISO
  totals: {
    findings_count: number;
    severity_counts: { low: number; medium: number; high: number; critical: number };
  };
  checklist_articles: Array<{
    article_id: number;
    title_ar: string;
    status: "ok" | "not_scanned" | "warning" | "fail";
    counts: Record<string, number>;
    triggered_atoms: string[]; // e.g. ["4.13", "4.26.a"]
  }>;
  article4_clauses?: Array<{
    atom_id: string;
    title_ar: string;
    status: "ok" | "warning" | "fail";
    counts: Record<string, number>;
  }>;
  findings_by_article: Array<{
    article_id: number;
    title_ar: string;
    counts: Record<string, number>;
    triggered_atoms: string[];
    top_findings: Array<{
      atom_id: string | null;
      title_ar: string;
      severity: string;
      confidence: number;
      evidence_snippet: string;
      location: Record<string, unknown>;
      start_offset_global?: number | null;
      end_offset_global?: number | null;
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
      is_interpretive?: boolean;
    }>;
  }>;
  // Optional; worker currently does NOT set this (passes empty lexiconSignals)
  lexicon_signals?: Array<{ term: string; line: number; severity: string; article_id: number; context?: string }>;
}
```

**checklist_articles**: One per GCAM article 1–25. `status = "not_scanned"` for non-scannable articles; else from presence and severity of findings in `byArticle`.  
**findings_by_article**: Built from same `byArticle`; `top_findings` = up to 10 findings per article, sorted by severity then confidence.

---

### 2.4 report_html (worker-built)

Produced by `buildReportHtml(summary: SummaryJson)` in `aggregation.ts`.  
- RTL HTML, Arabic.  
- Sections: header (title), ١ بيانات عامة (job_id, script_id, generated_at), ٢ ملخص تنفيذي (findings_count, severity_counts), ٣ مصفوفة الالتزام (table of checklist_articles: article, title, status symbol, counts), ٤ النتائج التفصيلية (per findings_by_article, then per top_findings: title_ar, atom_id, severity, confidence, evidence_snippet, location).  
- No lexicon_signals section in this worker HTML (summary does not include them when built by worker).

---

### 2.5 raawi_analysis_reports (table)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| job_id | UUID | Unique; FK raawi_analysis_jobs(id) |
| script_id | UUID | FK raawi_scripts(id) |
| created_by | UUID | nullable |
| summary_json | JSONB | Structure above |
| report_html | TEXT | Full HTML string |
| findings_count | INT | Redundant with totals.findings_count |
| severity_counts | JSONB | Redundant with totals.severity_counts |
| created_at | TIMESTAMPTZ | |

---

## 3. Lexicon Cache: Mandatory vs Soft Signal

### 3.1 Cache lifecycle

- **Module**: `worker/src/lexiconCache.ts`.  
- **Singleton**: `getLexiconCache(supabase)` returns one `LexiconCache` instance.  
- **Initialization**: On worker startup, `initializeLexiconCache(supabase)` is called → `cache.initialize()` → `refresh()` then `startAutoRefresh()`.  
- **Refresh**: Reads `slang_lexicon` where `is_active = true`, order by `term`. Replaces in-memory array. Refresh interval: **2 minutes** (`refreshInterval = 2 * 60 * 1000`). If a refresh fails, cache is **not** cleared (keep stale data).  
- **Concurrency**: `isRefreshing` prevents overlapping refreshes.

### 3.2 Matching (findMatches)

- **Input**: Plain text string (chunk).  
- **Per term** in cache:  
  - **word**: Regex with word boundaries `(?<!\p{L})term(?!\p{L})` (gui). Fallback without lookbehind: `(^|[^\p{L}\d_])term(?=[^\p{L}\d_]|$)`.  
  - **phrase**: Case-insensitive substring search; all occurrences.  
  - **regex**: `new RegExp(term.term, 'gui')`; all matches.  
- **Output**: Array of `LexiconMatch`: `{ term, matchedText, startIndex, endIndex, line, column }`. Line/column from `getLineAndColumn(text, index)` (split by `\n`).

### 3.3 Mandatory vs soft (lexiconMatcher)

- **Entry**: `analyzeLexiconMatches(text, supabase)` in `worker/src/lexiconMatcher.ts`.  
  - Gets cache via `getLexiconCache(supabase)`, runs `cache.findMatches(text)`.  
  - For each match:  
    - **If** `term.enforcement_mode === 'mandatory_finding'` → push to **mandatoryFindings** (LexiconFinding: term, match, articleId, atomId, articleTitleAr, severity from suggested_severity or severity_floor, isMandatory: true).  
    - **Else** → push to **softSignals** (LexiconSignal: term, match, suggestedSeverity).  
  - **contextForLLM** = `buildLLMContext(mandatoryFindings, softSignals)` — a text block “=== MANDATORY VIOLATIONS DETECTED ===” and “=== POTENTIAL ISSUES (Soft Signals) ===” with line/col, article, severity/category.  
  - Return `{ mandatoryFindings, softSignals, contextForLLM }`.

### 3.4 Use in worker (processChunkJudge)

- **Mandatory**:  
  - Converted to insertable shape (article_id, atom_id, severity, excerpt, line_start, line_end, explanation, evidence_snippet, term).  
  - **Inserted first** into `raawi_analysis_findings` with a synthetic `evidence_hash` = `sha256(jobId:lexicon:article_id:term:line_start)` so they are deduplicated and always stored as violations.  
  - Title: `مخالفة من قاموس المصطلحات: ${term}`.  
- **Soft**:  
  - Collected into `softSignalsForReport` (term, line, severity, article_id, context = matchedText).  
  - **Not** inserted as findings.  
  - **contextForLLM** is **not** currently appended to the Judge user message in the worker (so the Judge does not see “POTENTIAL ISSUES (Soft Signals)” in this implementation).  
  - Soft signals are passed to `runAggregationForJob` only in memory per chunk; in the current code, **aggregation** is called with **lexiconSignals = []** (empty), so `summary_json.lexicon_signals` is **not** filled by the worker. To surface soft signals in the report, either: persist chunk-level soft signals and merge them in aggregation, or have a separate report generator (e.g. raawi-generate-report) that does not use worker-built summary.

### 3.5 Summary table

| Mode | Stored as finding? | In report | LLM context (Judge) |
|------|--------------------|-----------|----------------------|
| mandatory_finding | Yes, immediately | Yes (normal finding) | Built but not injected in current worker |
| soft_signal | No | Only if summary_json.lexicon_signals populated (e.g. by another path) | Built but not injected in current worker |

---

## 4. Job States and Retry Logic

### 4.1 Job status values

- **queued**: Job created by **raawi-job-start**; after **raawi-job-ingest** succeeds, job remains `queued` with `progress_total` set, chunks created with `status: "pending"`.  
- **running**: Set by worker when it **first** claims a chunk for that job (`started_at` was null → update job to `status: "running"`, `started_at: now`).  
- **completed**: Set by worker in **runAggregationForJob** after report is inserted: `status: "completed"`, `completed_at: now`.  
- **failed**: Set by **raawi-job-ingest** on ingest failure (`failJob`), or by worker if aggregation fails (job stays in `running` or previous state; event JOB_FAILED logged). No automatic transition to a single “failed” status in all failure paths; ingest explicitly sets `status: "failed"` and `error_message`.

### 4.2 Chunk status values

- **pending**: Created by ingest; worker selects chunks with `status = 'pending'`.  
- **judging**: Set by worker in **claimChunk** when it takes a chunk (update chunk set `status = 'judging'` where `status = 'pending'`).  
- **done**: Set after successful processing (findings inserted, progress incremented).  
- **failed**: Set when chunk processing throws (e.g. Judge error, validation error) or when chunk text is empty or OPENAI_API_KEY missing; `last_error` stored.

**Note**: The worker never sets chunk status to `"routing"`; `jobHasActiveChunks` in `worker/src/index.ts` checks `in("status", ["pending", "routing", "judging"])` for safety. Only **pending → judging → done/failed** are used in practice.

### 4.3 Claim and progress

- **fetchNextJob**: One job with `status = 'queued'`, order `created_at` asc, limit 1.  
- **fetchNextPendingChunk**: One chunk for that job with `status = 'pending'`, order `chunk_index` asc.  
- **claimChunk**:  
  - Update chunk to `status = 'judging'` **only if** `status = 'pending'` (atomic).  
  - If job’s `started_at` is null, update job to `status: "running"`, `started_at: now`.  
- **incrementJobProgress**: Read job’s `progress_done` and `progress_total`; set `progress_done += 1`, `progress_percent = floor(100 * progress_done / progress_total)`.

### 4.4 Aggregation trigger

- After **each** chunk is processed (done or failed), worker calls **jobHasActiveChunks(jobId)**: exists any chunk with status in `['pending','routing','judging']`.  
- If **no** active chunk → **runAggregationForJob(jobId)**:
  - If report for job_id already exists → set job `completed`, script `report_issued`, insert report-ready notification, return.  
  - Else load all findings for job, build **summary_json** (with empty lexiconSignals), **report_html**, insert into **raawi_analysis_reports**, update job to **completed** and script to **report_issued**, insert events and notification.

### 4.5 Retry logic

- **No automatic retry** for failed chunks. A chunk that is set to `status: "failed"` is never reset to `pending` by the worker.  
- **jobHasActiveChunks** treats only `pending` / `routing` / `judging` as “active”. So when all chunks are either `done` or `failed`, aggregation runs.  
- **Result**: The report is still generated; findings from successful chunks are included; failed chunks simply contribute no findings.  
- **Manual retry** would require either: (1) resetting specific chunks to `pending` and ensuring job is `queued` or `running`, or (2) creating a new job (new run). The codebase does not implement (1).

### 4.6 Event log (raawi_analysis_events)

Worker and ingest insert events with `job_id`, `event_type`, `message`, `meta`, optional `chunk_id`. Examples: JOB_CREATED, INGEST_STARTED, CHUNKS_CREATED, CHUNK_CLAIMED_BY_WORKER, CHUNK_DONE, CHUNK_FAILED, FINDINGS_MERGED, JOB_READY_FOR_AGGREGATION, REPORT_GENERATED, JOB_COMPLETED, JOB_FAILED. Used for debugging and status APIs (e.g. raawi-job-status).

---

*This document reflects the codebase as of the described implementation; schema details are inferred from migrations and worker/ingest/report code.*
