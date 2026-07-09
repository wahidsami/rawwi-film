# Analysis Pipeline Reference

This document explains the current end-to-end analysis pipeline in this repository:

- how text is extracted and normalized
- how AI scanning runs (multi-pass + subject prompts)
- how findings are validated, deduplicated, and persisted
- how report/review layers are built
- where classification drift can happen and how we currently guard against it

---

## 1) High-Level Architecture

Main layers:

1. **Ingestion/Extraction**
   - Edge function `supabase/functions/extract/index.ts`
   - Worker PDF backend extraction `apps/worker/src/pdfExtraction.ts`
2. **Job + Chunk Processing**
   - Worker loop `apps/worker/src/index.ts`
   - Pipeline dispatcher `apps/worker/src/pipelineRunner.ts`
3. **AI Scanning**
   - Core processing `apps/worker/src/pipeline.ts`
   - Multi-pass engine `apps/worker/src/multiPassJudge.ts`
   - OpenAI calls/parsing `apps/worker/src/openai.ts`
4. **Post-processing + Storage**
   - Evidence/title normalization in `pipeline.ts` + `reviewFindingConsistency.ts`
   - Raw findings table: `analysis_findings`
5. **Aggregation + Review Layer**
   - `apps/worker/src/aggregation.ts`
   - Review findings table: `analysis_review_findings`
   - Report table: `analysis_reports`
6. **UI/Actions Sync**
   - Results/Workspace pages consume review + raw links
   - Edge API sync logic in `supabase/functions/findings/index.ts`

---

## 2) Ingestion and Extraction Flow

### Entry points

- Client uploads and then calls extract endpoint.
- `supabase/functions/extract/index.ts` handles:
  - DOCX extraction server-side
  - PDF flow (can queue backend extraction depending on mode)
  - canonical text normalization
  - `script_pages` and `script_text` persistence
  - creation of analysis job + chunks (`analysis_jobs`, `analysis_chunks`)

### Extraction outputs

Key outputs used downstream:

- `script_versions.extracted_text` (+ hash/status/progress)
- canonical text in `script_text`
- page slices in `script_pages`
- chunk rows in `analysis_chunks`

Offsets in later stages depend on this canonical text, so text consistency is critical.

---

## 3) Worker Runtime and Job Execution

Worker main loop: `apps/worker/src/index.ts`

What it does:

1. recover stale chunks
2. claim pending chunks (`claimChunkBatch`)
3. process chunks in parallel (config concurrency)
4. run aggregation when chunk work finishes or on recovery paths
5. manage hard timeouts, retries, overload handling

Dispatch:

- `pipelineRunner.ts` chooses pipeline version:
  - `v1` -> `processChunkJudge` in `pipeline.ts`
  - `v2` -> `processChunkJudgeV2` in `pipelineV2.ts` (delegates with v2 context additions)

---

## 4) AI Scanning: Prompts and Passes

### 4.1 Prompt layers

There are multiple prompt layers combined at runtime:

1. **Base pass prompt** from `multiPassJudge.ts` pass builders
2. **Violation system overlay** from `v3PromptPack.ts` (`buildV3PromptOverlay`)
3. **Shared rules** from `docs/V3 prompts/shared_overview.md`
4. **Subject prompt** for each v3 subject file in `docs/V3 prompts/*.md`
5. optional **context memory** block appended during run

### 4.2 17-subject model

`apps/worker/src/v3PromptPack.ts` defines `V3_SUBJECT_DEFINITIONS` (17 subjects).

When `VIOLATION_SYSTEM_VERSION === "v3"`:

- `multiPassJudge.ts` runs:
  - glossary pass
  - one pass per v3 subject (`v3_01...v3_17`)

### 4.3 Pass execution and gating

`runMultiPassDetection(...)` in `multiPassJudge.ts`:

1. builds execution plan (`planDetectionPassExecution`)
2. applies pass gating signals (`passGating.ts`)
3. runs active passes in parallel
4. enforces per-pass hard timeout
5. parses and tags pass findings
6. deduplicates findings

### 4.4 OpenAI call contract

`openai.ts` (`callJudgeRaw`, parser/repair methods) enforces structured JSON:

- `findings[]` with evidence, location offsets, confidence, titles, rationale, etc.

Parsing uses robust JSON extraction/repair to reduce malformed output failures.

---

## 5) Raw Finding Post-Processing (analysis_findings)

In `pipeline.ts`, after pass outputs:

1. **Evidence grounding**
   - canonical snippet preference from source text offsets
   - snippet quality checks
2. **Title normalization**
   - `normalizeMisusedGlossaryPassTitle(...)`
   - `normalizeFindingTitleAgainstRationale(...)`
3. **Anchor payload construction**
   - page/global offsets, anchor method/confidence
4. **upsert to `analysis_findings`**
   - conflict key: `job_id,evidence_hash`
5. **policy link upsert**

Important: this stage already tries to keep title/rationale/evidence coherent before save.

---

## 6) Aggregation and Report Build

`runAggregation(jobId)` in `apps/worker/src/aggregation.ts`:

1. loads `analysis_findings`
2. builds summary JSON:
   - canonical findings
   - findings by article
   - metrics
3. writes/upserts `analysis_reports`
4. materializes review rows into `analysis_review_findings`

### Review row materialization

`materializeReviewFindings(...)`:

- starts from summary canonical findings + hints
- normalizes each row using:
  - `normalizeReviewFindingConsistency(row, fullScriptText)`
- carries review state from prior rows with matching logic
- runs normalization again after carry-forward (current strict alignment)

This double normalization is intentional to prevent stale category/title drift.

---

## 7) Strict Classification Alignment (Current Guards)

Current alignment guards live mainly in:

- `apps/worker/src/reviewFindingConsistency.ts`
- `apps/worker/src/aggregation.ts`

### `reviewFindingConsistency.ts` responsibilities

1. detect title drift (religious/political/sexual anchors)
2. infer grounded replacement title from evidence/context
3. repair rationale when it references drifted category
4. remap `primary_article_id` (legacy policy IDs) from final title
5. optionally remap `primary_atom_id` for relevant categories

### Carry-forward guard in aggregation

`applyPriorReviewState(...)` now preserves full prior classification only for true manual rows.

Why:

- previously, any row marked edited could override fresh classification
- that could force old wrong category into new runs

Now AI/glossary rows keep new evidence-based classification while still carrying review status/meta fields.

---

## 8) UI Review Layer and Actions

UI pages:

- `apps/web/src/pages/Results.tsx`
- `apps/web/src/pages/ScriptWorkspace.tsx`

Actions (`Mark Safe`, `Edit`, etc.) require linking review rows to raw rows.

Linking strategy:

1. canonical finding id match
2. fallback by evidence snippet (+ article when available)
3. relaxed fallback by evidence only

Related backend sync:

- `supabase/functions/findings/index.ts`
- sync helpers update review rows from raw row actions/classification

This was hardened so review sync still works even if article bucket changed.

---

## 9) How Scans Are Actually “Made”

For each chunk:

1. chunk text + allowed article set prepared
2. pass planner decides active subject/passes
3. each active pass receives a **focused prompt**:
   - subject-specific rules
   - shared rules
   - strict evidence/rationale constraints
4. model returns candidate findings
5. pass findings are normalized/tagged
6. merged + deduplicated across passes
7. final raw rows persisted with canonical offsets/snippets

Then aggregation:

8. canonical findings clustered and summarized
9. review findings generated (with strict consistency normalization)
10. report UI reads review layer and raw layer links

---

## 10) Known Failure Modes and What They Look Like

### A) Category/title drift

Symptom:

- rationale clearly says child/women/political/etc.
- card title remains unrelated (e.g., religious)

Typical causes:

- stale carry-forward override
- weak anchor checks in remapping

Current mitigation:

- strict re-normalization before and after carry-forward
- manual-only classification carry-forward

### B) Missing action buttons on some cards

Symptom:

- card only shows include toggle; mark-safe/edit missing

Cause:

- review row not linked to a raw row

Mitigation:

- stronger review/raw fallback matching in UI and findings sync API

### C) Duplicate near-identical findings

Cause:

- multiple passes returning same span with slight variation

Mitigation:

- dedup key in `multiPassJudge.ts` and additional normalization in storage/aggregation

---

## 11) Prompt Governance and Tuning Checklist

When tuning behavior, change in this order:

1. `docs/V3 prompts/shared_overview.md` (global rules)
2. specific subject file `docs/V3 prompts/<subject>.md`
3. fallback embedded rules in `v3PromptPack.ts`
4. post-processing mapping logic in `reviewFindingConsistency.ts`

Always validate with:

1. `npx tsc -p apps/worker/tsconfig.json --noEmit`
2. `npm run test:review-consistency --workspace=apps/worker`
3. one fresh analysis run on a known script and compare:
   - title/rationale coherence
   - duplicate rate
   - action-link availability in UI

---

## 12) Key Files Quick Index

- Worker loop: `apps/worker/src/index.ts`
- Pipeline dispatch: `apps/worker/src/pipelineRunner.ts`
- Main chunk pipeline: `apps/worker/src/pipeline.ts`
- Multi-pass scanning: `apps/worker/src/multiPassJudge.ts`
- Prompt pack: `apps/worker/src/v3PromptPack.ts`
- Shared prompt rules: `docs/V3 prompts/shared_overview.md`
- OpenAI wrappers/parsers: `apps/worker/src/openai.ts`
- Aggregation/report/review materialization: `apps/worker/src/aggregation.ts`
- Review consistency normalizer: `apps/worker/src/reviewFindingConsistency.ts`
- Findings API/sync: `supabase/functions/findings/index.ts`
- Extraction edge function: `supabase/functions/extract/index.ts`

---

## 13) Practical Debug Path (Recommended)

When a bad report appears:

1. inspect one bad card:
   - title, rationale, evidence, page, canonical id
2. trace in DB:
   - `analysis_findings` row
   - matching `analysis_review_findings` row
3. confirm where drift appeared:
   - during pass output?
   - during raw insert normalization?
   - during aggregation carry-forward?
4. patch smallest layer responsible
5. re-run fresh analysis (not old report refresh) to verify

---

If this pipeline changes significantly (new model provider, new pass planner, new schema), update this document in the same PR.
