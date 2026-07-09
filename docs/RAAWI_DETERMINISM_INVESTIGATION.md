# Raawi Determinism Investigation

This note records the implementation-grounded reasons why the same script can sometimes yield a different final finding count across repeated analyses.

## Executive summary

The worker pipeline is not a single-pass "emit findings and stop" flow. It contains several explicit filtering and collapse stages that can reduce the final count after the model has already produced findings. The most likely first divergence point is the model response itself, but the visible difference between an 11-finding run and an 8-finding run is often caused by later stages that discard or merge findings.

## Evidence from the implementation

### 1. The first non-deterministic branch is the model response itself

The LLM interaction layer is the first place where repeated runs can diverge:

- [apps/worker/src/openai.ts](../apps/worker/src/openai.ts) — `callRouter` and `callJudgeRaw` send prompt content to the model with fixed temperature/seed settings when configured, but the model output is still not guaranteed to be byte-for-byte stable across runs.
- [apps/worker/src/openai.ts](../apps/worker/src/openai.ts) — `parseJudgeWithRepair` tries to parse the judge response, and if parsing or Zod validation fails it can salvage only some findings instead of returning the whole set. That logic can transform a slightly malformed response into a smaller or different finding list.

Why this matters:
- A slightly different JSON payload or a repaired response can produce fewer valid findings even when the underlying script and prompt are the same.
- This is the earliest plausible divergence point for the final count.

### 2. Multi-pass refinement drops findings before the pipeline reaches the final persist step

The main chunk-processing path in [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts) applies several lossy steps inside `processChunkJudge`:

- `groundFindingEvidenceToChunk` is used to anchor findings to literal chunk text.
- Findings are then filtered through a quality gate and a verbatim guardrail.
- The pipeline logs how many findings survive grounding, quality filtering, and verbatim checks.

The key count-reduction logic is in the `processChunkJudge` refinement block:

- grounded findings are selected from the raw multi-pass output
- strict-proof findings are filtered further by grounding method
- low-quality evidence snippets are dropped
- the final verbatim guard drops any finding whose evidence no longer matches the script text exactly

That means a smaller or differently grounded set can readily collapse from an initially larger model output.

### 3. Duplicates and overlaps are explicitly collapsed

The chunk pipeline also reduces the count with deterministic but lossy normalization steps:

- [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts) — `dedupeByHash`
- [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts) — `overlapCollapse`
- [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts) — `dropRedundantArticleFourFindings`

These functions do not simply preserve all findings. They keep a preferred item per evidence hash, collapse overlapping spans, and suppress article-4 findings that are redundant with more specific findings. If the earlier stages produce slightly different evidence snippets or offsets, the survivors can change even when the overall incident is similar.

### 4. Final persistence applies additional evidence-based filters

Before rows are inserted into the database, the pipeline performs another round of filtering in [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts):

- `getStoredEvidenceQualityIssue`
- `getPassSpecificEvidenceIssue`
- `snippetsReasonablyAlign`
- `hasExplicitSceneMismatch`

Each of these can drop a finding before it reaches the database. The counts emitted at this stage are therefore not the same as the earlier multi-pass counts.

### 5. Aggregation re-deduplicates and canonicalizes again

The report aggregation layer performs another reduction step:

- [apps/worker/src/aggregation.ts](../apps/worker/src/aggregation.ts) — `dedupeFindings`
- [apps/worker/src/aggregation.ts](../apps/worker/src/aggregation.ts) — `buildSummaryJson`

Aggregation loads all persisted findings, sorts them, deduplicates them, clusters them into canonical findings, and produces the final report totals. This layer can further reduce the visible count even if the database already contains more raw rows.

## Why a run can go from 11 findings to 8

The most likely explanation is:

1. The model produces a larger set of candidate findings.
2. One or more of the later stages discards findings because the evidence is not grounded tightly enough, the snippet fails a verbatim check, the overlap logic prefers a stronger candidate, or the final evidence checks reject the item.
3. Aggregation then canonicalizes the survivors again.

In other words, the difference is not caused by a single mysterious branch. It comes from a chain of explicit pruning stages that all make the final count smaller.

## What changed

To make this observable without changing behavior, the worker now logs a stage-by-stage debug summary for:

- router request and response preparation
- judge request and response preparation
- parse/repair outcomes
- lexicon stage completion
- router stage completion
- multi-pass refinement outcomes
- dedupe/overlap stage outcomes
- validation/hybrid stage outcomes
- persistence stage outcomes
- aggregation input and canonicalization outcomes

The instrumentation is in:

- [apps/worker/src/openai.ts](../apps/worker/src/openai.ts)
- [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts)
- [apps/worker/src/aggregation.ts](../apps/worker/src/aggregation.ts)

## Verification status

- Editor diagnostics for the modified worker files reported no errors.
- A targeted aggregation test run was attempted, but it is currently blocked by a missing Supabase URL environment configuration in this workspace.
