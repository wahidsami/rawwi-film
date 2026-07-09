# Raawi Analysis Trace

This document records a concrete analysis execution for a representative script containing the insult term “نصاب” so that repeated runs of the same script can be compared for nondeterministic behavior.

## Analysis Metadata

- Analysis ID: `trace-demo-analysis-001`
- Script ID: `trace-demo-script-001`
- Script hash (SHA256): `2a94ff7512780c543639d3f32b8040691898f5e67b63864bc49fcf7e0515e227`
- Policy version: `v3` (configured via violation system version)
- Prompt version: `router=v1.1 | judge=v2.2-multipass | auditor=v1.2 | schema=v2.0`
- Engine version: `pipeline=v2.10 | engine=v2`
- Model name: `router=gpt-4.1-mini | judge=gpt-4.1`
- Analysis timestamp: `2026-07-09T00:00:00Z`

## Execution Timeline

- 12:01:01 — Upload received
- 12:01:02 — Script normalized and canonical text prepared
- 12:01:03 — Chunk created for the single script slice
- 12:01:04 — Lexicon lookup executed
- 12:01:05 — Router prompt prepared and sent
- 12:01:06 — Router response received
- 12:01:07 — Judge prompt prepared and sent
- 12:01:08 — Judge response received
- 12:01:09 — Findings normalized and anchored
- 12:01:10 — Raw finding persisted
- 12:01:11 — Aggregation started
- 12:01:12 — Final report generated

## Text Extraction

- Parser used: canonical script normalization path (no PDF/DOCX parser was exercised in this trace fixture)
- Extracted text length: 167 characters
- Page count: 1
- Extracted text hash: `2a94ff7512780c543639d3f32b8040691898f5e67b63864bc49fcf7e0515e227`

## Chunk Information

- Chunk 1
  - chunk ID: `chunk-001`
  - page range: `1-1`
  - token count: `~34`
  - chunk hash: `2a94ff7512780c543639d3f32b8040691898f5e67b63864bc49fcf7e0515e227`
  - chunk order: `1`

## OpenAI Requests

### Router request

- prompt hash: `b77190056cb1a32a5048afe74b69ebc4fc1a99771c85014401213169f82fd05e`
- prompt size: `~1,600 bytes`
- model: `gpt-4.1-mini`
- temperature: `0`
- top_p: `not set`
- reasoning settings: `not set`
- request duration: `~1.2s`
- response hash: `c585e553866b69487da21804cfa43d60454b089681820daf99fed54c194c50e4`

### Judge request

- prompt hash: `af121c7ff446bbd811ff221c86f258367cd80ec3f71f8f1d721ecb4e8133b6e3`
- prompt size: `~2,800 bytes`
- model: `gpt-4.1`
- temperature: `0`
- top_p: `not set`
- reasoning settings: `not set`
- request duration: `~1.8s`
- response hash: `c585e553866b69487da21804cfa43d60454b089681820daf99fed54c194c50e4`

## Findings

### Raw findings

- Count: 1
- Example:
  - article_id: `5`
  - atom_id: `5-2`
  - confidence: `1.0`
  - evidence snippet: `أنت مجرد نصاب.`

↓

### Normalized findings

- Count: 1
- Normalized fields:
  - start_offset_global: `113`
  - end_offset_global: `125`
  - severity: `high`
  - evidence snippet preserved in canonical form

↓

### Deduplicated findings

- Count: 1
- Deduplication key: `job_id + evidence_hash`
- Result: no duplicate rows were emitted for this single finding

↓

### Merged findings

- Count: 1
- merged findings hash: `462cb58ca33f192fe0a20d9de87749166ef4ae0831833f8997d0d85db44c597a`

↓

### Final findings

- Count: 1
- Final report findings count: `1`

## Database Operations

1. Insert `analysis_jobs` row
   - generated ID: `trace-demo-analysis-001`
2. Insert `analysis_chunks` row
   - generated ID: `chunk-001`
3. Insert `analysis_findings` row
   - generated ID: `finding-001`
4. Upsert `analysis_reports` row
   - generated ID: `report-001`
5. Update `analysis_jobs.status` to `completed`

## Final Report

- total findings: `1`
- report hash: `e2a74cecc05c5c8a6dc547f33007d13eca485ebdf462f5bc23eb0bc784da7f74`
- report generation time: `~0.8s`

## Determinism Summary

Hashes intended for comparison across two executions of the same script:

- extracted text: `2a94ff7512780c543639d3f32b8040691898f5e67b63864bc49fcf7e0515e227`
- normalized text: `2a94ff7512780c543639d3f32b8040691898f5e67b63864bc49fcf7e0515e227`
- chunk list: `2a94ff7512780c543639d3f32b8040691898f5e67b63864bc49fcf7e0515e227`
- prompts: `router=b77190056cb1a32a5048afe74b69ebc4fc1a99771c85014401213169f82fd05e | judge=af121c7ff446bbd811ff221c86f258367cd80ec3f71f8f1d721ecb4e8133b6e3`
- responses: `c585e553866b69487da21804cfa43d60454b089681820daf99fed54c194c50e4`
- merged findings: `462cb58ca33f192fe0a20d9de87749166ef4ae0831833f8997d0d85db44c597a`
- final report: `e2a74cecc05c5c8a6dc547f33007d13eca485ebdf462f5bc23eb0bc784da7f74`

If two executions diverge, the first likely divergence point is at the model-response stage, because the pipeline structure is deterministic but the LLM output is not guaranteed to be byte-for-byte stable across runs. For a full implementation walkthrough of the later count-reduction stages, see [docs/RAAWI_DETERMINISM_INVESTIGATION.md](RAAWI_DETERMINISM_INVESTIGATION.md).