# Pipeline V2 Rollout Plan

## Goal

Introduce `Pipeline V2` without risking the current production workflow.

Core requirement:

- `V1` must remain available as the stable fallback
- `V2` must be selectable per job
- rollback must be a config switch, not an emergency code revert

## Rollout Model

### V1

- current production-safe baseline
- default fallback
- used whenever `pipeline_version` is missing or set to `v1`

### V2

- next-generation pipeline track
- enabled per job via `config_snapshot.pipeline_version = "v2"`
- initially allowed to reuse parts of V1 while V2 capabilities are added incrementally

## Control Points

### 1. Runtime default

Worker/runtime env:

- `ANALYSIS_PIPELINE_VERSION=v1|v2`

Safe default:

- `v1`

### 2. Per-job override

Task creation stores:

- `config_snapshot.pipeline_version`
- `config_snapshot.analysis_engine`
- `config_snapshot.hybrid_mode`

This means each job is self-describing and reproducible.

## V2 Profile Mapping

For V2 jobs, analysis profiles now map to real methodology choices:

### `turbo`

- detector flow only
- `analysis_engine = "v2"`
- `hybrid_mode = "off"`
- fastest V2 option

### `balanced`

- detector flow + hybrid evaluation
- `analysis_engine = "hybrid"`
- `hybrid_mode = "shadow"`
- keeps baseline persisted while logging hybrid comparison

### `quality`

- detector flow + hybrid enforcement
- `analysis_engine = "hybrid"`
- `hybrid_mode = "enforce"`
- highest-accuracy V2 option

## Dispatch Strategy

Worker uses a dispatcher:

- if job requests `v1` -> run V1
- if job requests `v2` -> run V2

This keeps both pipelines deployed together.

## Rollback Plan

If V2 causes problems:

1. set new jobs back to `pipeline_version = v1`
2. keep V2 code deployed for debugging
3. do not revert code unless absolutely necessary

This gives instant rollback for new analyses while preserving failed/suspicious V2 jobs for comparison.

## Recommended Rollout Phases

### Phase 1: Foundation

- add per-job pipeline version
- add worker dispatcher
- add V2 scaffold

### Phase 2: Internal testing

- run selected jobs on V2 manually
- compare against V1

### Phase 3: Shadow evaluation

- optionally run V2 for internal comparison while V1 remains official
- V2 `balanced` now provides a true shadow mode:
  - hybrid runs
  - metrics are logged
  - persisted findings stay on the baseline branch

### Phase 4: Limited production exposure

- enable V2 for specific users / clients / modes

### Phase 5: Promotion

- only after measured quality improvement

## V2 Development Priorities

1. scene/chunk memory layer
2. exact evidence pinning pass
3. better context-aware auditor pass
4. stronger cross-chunk reasoning
5. benchmark and compare against V1

## Implemented So Far

- per-job `pipeline_version` with dispatcher-based rollback safety
- chunk-adjacent memory
- script-level sampled memory
- exact evidence pinning
- scene-aware memory from deterministic screenplay heading detection
- context-aware deep auditor with V2 memory + hybrid candidate hints
- local comparison harness for future V1 vs V2 real-script evaluations
- V2 methodology mapping by mode:
  - `turbo` -> detector only
  - `balanced` -> hybrid shadow
  - `quality` -> hybrid enforce

## Design Principle

Pipeline V2 should improve methodology while keeping the output contract compatible with:

- findings persistence
- aggregation
- workspace
- reports
- review layer

That keeps the rest of the product stable while the analysis core evolves.

## Deployment Memory

When we do the final batched rollout, current known deploy items are:

- worker deploy
- `supabase/functions/tasks` deploy
- web deploy

Current SQL status:

- no new migration required yet
- no new Supabase table/column required yet
