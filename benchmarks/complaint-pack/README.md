# Complaint Benchmark Pack

This pack turns real product pain points into a repeatable evaluation workflow.

It is designed for the current deployment model:

- upload short synthetic scripts once in the product
- note the resulting `version_id` values
- fill them into the dataset file
- run a fresh benchmark on the VPS after each major AI change

## Contents

- `scripts/*.txt`
  Short upload-ready Arabic script cases that isolate specific complaints.
- `dataset.sample.json`
  Dataset format and starter expectations. Replace empty `version_id` fields after upload.

## What This Measures

- obvious complaint reproduction
- atom precision on weak atoms
- false positives on narrative-sensitive cases
- rationale usefulness on benchmarked findings

## Suggested Workflow

1. Upload each file in `scripts/` through the normal product flow.
2. Record the `version_id` for each uploaded script.
3. Copy `dataset.sample.json` if you want a local variant, or edit it directly with the real `version_id` values.
4. Export the benchmark environment variables on the VPS:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BENCHMARK_TASKS_URL`
   - `BENCHMARK_BEARER_TOKEN`
   - `COMPLAINT_BENCHMARK_DATASET`
5. Run:

```bash
npm run benchmark:complaints
```

## Notes

- The scorer creates fresh analysis jobs with `forceFresh=true` by default.
- It is intentionally conservative:
  - a case fails if a required finding is missing
  - a case fails if a forbidden finding appears
  - a rationale can be scored separately from detection
- Some cases allow `accepted_atoms` so we can distinguish:
  - fully correct atom mapping
  - acceptable-but-not-preferred mapping
  - true miss
