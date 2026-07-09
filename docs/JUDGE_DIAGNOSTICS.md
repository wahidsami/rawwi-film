# Judge Diagnostics

## Why this table exists

The table public.analysis_judge_diagnostics exists only to trace where two analyses of the same script first diverge.

It is a diagnostics feature, not an analysis feature.

It does not change routing, prompts, filtering, grounding, validation, or finding persistence logic.

## Feature flag

Diagnostics writes are controlled by one environment variable:

ENABLE_AI_DIAGNOSTICS=true

When ENABLE_AI_DIAGNOSTICS is false:
- no diagnostics rows are written
- diagnostics writes are skipped entirely

## Table

Table: public.analysis_judge_diagnostics

Main write paths:
- apps/worker/src/multiPassJudge.ts
  - after each Judge call parse result
  - diagnostic_kind = judge_call
- apps/worker/src/policyV1/sceneAnalyzer.ts
  - after scene analyzer Judge response parse attempt
  - diagnostic_kind = judge_call
- apps/worker/src/pipeline.ts
  - after chunk processing is complete, immediately before analysis_findings upsert
  - diagnostic_kind = chunk_final

## Columns

- id
  - UUID primary key.

- job_id
  - Analysis job id.

- chunk_id
  - Chunk id associated with this diagnostic record.

- diagnostic_kind
  - judge_call or chunk_final.

- prompt_hash
  - SHA256 of the exact Judge prompt payload (system + user) for judge_call rows.
  - For chunk_final rows this is empty.

- router_candidates
  - Router candidate payload captured for context.

- raw_judge_response
  - Raw Judge text response before parse repair.
  - For chunk_final rows this is empty.

- judge_response_hash
  - SHA256(raw_judge_response).
  - Used for fast comparison between runs.

- raw_finding_count
  - Count of findings parsed directly from raw_judge_response before repair/normalization.
  - Null if raw response does not expose a parseable findings array.

- parsed_judge_response
  - Parsed object used by the pipeline after parse/repair path.
  - For chunk_final rows this is null.

- parsed_finding_count
  - Count of findings in parsed_judge_response for judge_call rows.
  - 0 for chunk_final rows.

- grounded_finding_count
  - Chunk-level count after grounding stage.
  - Populated on chunk_final rows.

- validated_finding_count
  - Chunk-level count after validation/hybrid-policy stage.
  - Populated on chunk_final rows.

- final_chunk_finding_count
  - Number of findings prepared for analysis_findings upsert.
  - Populated on chunk_final rows.

- final_chunk_findings
  - Exact JSON rows payload that is about to be persisted to analysis_findings for that chunk.
  - Populated on chunk_final rows.

- timestamp
  - Diagnostic write timestamp.

## Fail-open guarantee

All diagnostics writes are fail-open:
- write failure logs a warning
- analysis continues
- diagnostics never abort analysis

## Compare two analyses

Use compare_judge_diagnostics.sql from repository root.

File:
- compare_judge_diagnostics.sql

What it returns per chunk:
- Prompt hash
- Judge response hash
- Raw finding count
- Parsed finding count
- Grounded finding count
- Validated finding count
- Final chunk finding count
- differs boolean
- is_first_divergent_chunk boolean

How to use:
1. Replace JOB_ID_A and JOB_ID_B in the SQL file.
2. Run the query in Supabase SQL editor or psql.
3. Find the row where is_first_divergent_chunk is true.

## Cleanup old diagnostics data

Examples:

Delete diagnostics older than 14 days:

DELETE FROM public.analysis_judge_diagnostics
WHERE timestamp < now() - interval '14 days';

Delete diagnostics for one job:

DELETE FROM public.analysis_judge_diagnostics
WHERE job_id = 'YOUR_JOB_ID'::uuid;
