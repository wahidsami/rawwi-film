# Analysis Pipeline — Technical Reference for Agent Implementation

This document describes **how script compliance analysis works** from task creation to the final report. Use it so an agent (or new implementation) understands the full process, inputs, outputs, and data flow.

---

## 1. Overview

- **Input:** A script (full text) and optional analysis options (merge strategy: one card per location vs one card per occurrence).
- **Output:** A report with: violations (canonical findings), special notes (hints), words/phrases to revisit, and optional script summary.
- **Process:** Script is split into **chunks**; each chunk is processed by Lexicon → (optional) Router → Multi-Pass Judge → (optional) Deep Auditor → Rationale-only if needed; then **aggregation** runs once all chunks are done: overlap clustering, report gate, words-to-revisit pass, and summary JSON/HTML.

---

## 2. Task Creation (Edge / API)

1. User triggers "Start analysis" with optional **analysis options** (e.g. `mergeStrategy`: `same_location_only` | `every_occurrence`).
2. **Edge function** (e.g. `tasks`):
   - Validates version and script, loads normalized text from `script_text` (or builds it from `content_html` / `extracted_text`).
   - **Chunking:** `chunkText(normalized, 12000, 800)` → chunks of ~12,000 characters with 800-character overlap.
   - Inserts one row in `analysis_jobs` (with `config_snapshot`: models, prompt versions, **analysisOptions**) and N rows in `analysis_chunks` (one per chunk).
3. Worker is notified (or polls) and processes chunks.

---

## 3. Per-Chunk Processing (Worker)

For each chunk with status `pending`:

### 3.1 Lexicon (no LLM)

- Load active terms from `slang_lexicon` (term, `gcam_article_id`, severity).
- Search chunk text for each term (word-boundary / phrase match).
- Every match → insert one row in `analysis_findings` with `source = lexicon_mandatory`, article/atom from lexicon, evidence snippet, offsets.

### 3.2 Router (optional, one LLM call)

- If `WORKER_HIGH_RECALL` is not set: send chunk (first ~15k chars) + full article list to **Router**.
- **Input:** System prompt (router) + user: list of articles (id + title_ar) + `---` + chunk text. Lexicon terms are injected into router prompt.
- **Output:** JSON `{ "candidate_articles": [ { "article_id", "confidence" } ], "notes_ar": "..." }`. Sorted by confidence, take up to `max_router_candidates` (e.g. 8).
- **Use:** These article IDs are the ones the Judge will evaluate for this chunk (unless HIGH_RECALL, in which case all articles are used).

### 3.3 Multi-Pass Judge (multiple parallel LLM calls)

- **Input:** Chunk text + list of articles (from Router or full list) + full article text and atoms from PolicyMap. Lexicon terms injected into Judge prompt.
- **Passes:** Several specialized passes run in parallel (Glossary, Insults, Violence, Sexual content, Drugs & alcohol, Discrimination & incitement, National security, Extremism & banned groups, Misinformation, International relations). Each pass has a dedicated prompt and returns `{ "findings": [ ... ] }`.
- **Finding shape:** Each finding: `article_id`, `atom_id` (e.g. `"4-1"`), `title_ar`, `description_ar`, `severity`, `confidence`, `evidence_snippet`, `location` (start_offset, end_offset, start_line, end_line).
- **Output:** All findings are merged and deduplicated (same source + article + atom + span + snippet → keep highest severity).
- Findings are written to `analysis_findings` with `location` (and optionally a v3 sub-object for later auditor fields).

### 3.4 Deep Auditor (optional, one LLM call per chunk in hybrid mode)

- **Input:** All findings for this chunk (as "canonical candidates") + **full chunk text** (up to ~35k chars).
- **System prompt:** Auditor instructions (one assessment per candidate, `rationale_ar` mandatory, `final_ruling`: violation | needs_review | context_ok).
- **Output:** JSON `{ "assessments": [ { "canonical_finding_id", "rationale_ar", "title_ar", "final_ruling", "pillar_id", "primary_article_id", "related_article_ids", "confidence", "confidence_breakdown", "severity" } ] }`.
- **Use:** Assessments are written back into findings (e.g. in `location.v3`: rationale_ar, final_ruling, primary_article_id, related_article_ids, pillar_id).

### 3.5 Rationale-only pass (optional, one LLM call)

- If any finding still has empty or default rationale: one batch call with list of (canonical_finding_id, evidence_snippet, final_ruling, primary_article_id).
- **Output:** `{ "rationales": [ { "canonical_finding_id", "rationale_ar" } ] }`. Used to fill missing rationales.

### 3.6 Chunk completion

- Chunk status set to `done`; findings persisted. When **no** chunks remain `pending` or `judging`, aggregation runs.

---

## 4. Aggregation (once per job)

1. **Load:** All rows from `analysis_findings` for the job; load job record (including `config_snapshot.analysisOptions`).
2. **Dedupe:** By (source, article_id, atom, span, snippet) → keep highest severity.
3. **Clustering:**
   - If `mergeStrategy === "every_occurrence"`: no overlap merge; each deduped finding = one cluster.
   - Else: `clusterByOverlap(deduped, 0.85)` so findings with high span overlap become one "canonical" finding (one card per location, multiple articles on same card).
4. **Canonical findings:** For each cluster, pick primary finding (by article specificity, severity, etc.), build canonical item (id, title_ar, evidence_snippet, severity, confidence, final_ruling, rationale, primary_article_id, related_article_ids, policy_links, offsets, lines).
5. **Report gate:** For each canonical finding, if `final_ruling === "context_ok"` or if rationale text matches "not a violation" phrases (e.g. "السياق مقبول", "لا يعد مخالفة", "يخدم السياق الدرامي") → move to **report_hints** (special notes). Otherwise → keep in **canonical_findings** (violations). Rebuild totals and checklist from violations only.
6. **Words to revisit:** One LLM call (Revisit Spotter) on **full script text** + active lexicon terms. Output: list of mentions (term, snippet, start_offset, end_offset). Stored in `summary.words_to_revisit`.
7. **Script summary (optional):** If full script text is available, optional LLM call to generate a short script summary; stored in `summary.script_summary`.
8. **Persistence:** `summary_json` (with canonical_findings, report_hints, words_to_revisit, totals, checklist_articles, etc.) and `report_html` written to `analysis_reports`; job status set to `completed`.

---

## 5. Data Shapes (Summary)

| Stage | Input | Output |
|-------|--------|--------|
| Chunking | Full script text | Chunks (text, index), job config with analysisOptions |
| Lexicon | Chunk text, lexicon terms | Findings (source=lexicon_mandatory) |
| Router | Chunk, article list, lexicon | candidate_articles (article_id, confidence) |
| Judge (each pass) | Chunk, articles (full text+atoms), lexicon | findings[] |
| Auditor | Chunk, candidate findings | assessments[] (rationale_ar, final_ruling, primary/related articles) |
| Rationale-only | List of findings missing rationale | rationales[] (canonical_finding_id, rationale_ar) |
| Aggregation | All findings, job config | summary_json, report_html |
| Revisit Spotter | Full script, lexicon terms | mentions[] (term, snippet, offsets) |

---

## 6. Configuration Snapshot (Job)

Stored in `analysis_jobs.config_snapshot` and used by aggregation and worker:

- **analysisOptions:** `{ mergeStrategy: "same_location_only" | "every_occurrence" }`
- **router_model**, **judge_model**, **temperature**, **seed**, **max_router_candidates**
- **Prompt versions:** router, judge, auditor, schema (for cache keys and reproducibility)

---

## 7. Report Output Structure

- **canonical_findings:** List of violation cards (each: id, title_ar, evidence_snippet, severity, confidence, rationale, primary_article_id, related_article_ids, policy_links, line range, etc.).
- **report_hints:** Same shape but for "special notes" (not counted as violations).
- **words_to_revisit:** List of { term, snippet, start_offset, end_offset }.
- **totals:** findings_count, severity_counts.
- **checklist_articles:** Per-article status and counts.
- **script_summary:** Optional short narrative summary of the script.

This pipeline is the single source of truth for "how analysis works" when designing an agent or a new implementation.
