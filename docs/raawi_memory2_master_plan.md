# Raawi Memory2 Master Plan

This document defines the full implementation plan to introduce `Memory2` while keeping the current system (`Memory1`) fully available.

## 1) Goal

1. Improve AI continuity and context grounding so reasoning matches the real scene/event.
2. Keep category ownership with AI + strict validation (no reinterpretation drift).
3. Add a safe runtime switch in admin settings:
   - `Memory1` (current behavior)
   - `Memory2` (new staged memory architecture)

## 2) Operating Model

- `Memory1`: current pipeline behavior (existing context/scene/script memory logic).
- `Memory2`: new architecture with explicit staged recall and traceability.
- The selected mode is stored in `app_settings.key = "analysis_memory_mode"`.
- Every new analysis job snapshots the selected mode in `analysis_jobs.config_snapshot.analysis_memory_mode`.
- Worker dispatch uses job snapshot (not live settings), so runs are deterministic.

## 3) Phase Plan

## Phase A — Control Plane (Done in this PR slice)

1. Add admin setting endpoint:
   - `GET /settings/analysis-memory`
   - `PUT /settings/analysis-memory`
2. Add admin dropdown in Settings page.
3. Persist selected mode in `app_settings`.
4. Inject `analysis_memory_mode` into every new `analysis_jobs.config_snapshot`.
5. Worker reads snapshot and routes memory mode safely (`Memory2` => v2 for now).

## Phase B — Memory2 Data Layer

1. Add memory tables (or equivalent JSON structures) for:
   - script-level memory units
   - scene-level memory units
   - retrieval traces per chunk/pass
2. Store only anchored, verbatim evidence windows with offsets/page ids.
3. Add metadata for retrieval filters:
   - script_id, version_id, chunk range, scene label, speaker hints, tags

## Phase C — Memory2 Retrieval Engine

1. Build staged retrieval:
   - Stage 0: compact chunk-local memory
   - Stage 1: scene-bounded recall
   - Stage 2: script-level recall
   - Stage 3: deep fallback (only when needed)
2. Retrieval policy:
   - metadata filter first
   - rank second
   - strict token budget caps per stage
3. Output `memory_context_bundle` with source trace ids.

Status update:
- Initial Stage 0/1/2 implementation is now wired in worker (`apps/worker/src/pipelineV2/stagedMemory2.ts`) with strict per-stage char budgets.
- Stage bundle is persisted to `analysis_memory_units` and stage stats are persisted in `analysis_memory_traces`.
- Stage 3 deep fallback is pending.

## Phase D — Prompt + Evidence Contract

1. Prompt contract for Memory2:
   - memory is for interpretation only
   - evidence must exist in current chunk
2. Add validation:
   - reject findings whose rationale depends on memory-only text not present in chunk evidence
3. Save rationale-to-memory trace for audits.

## Phase E — Classification Stability

1. Keep AI classification as source.
2. Aggregation layer must validate, not reinterpret.
3. Post-processing should:
   - preserve category from raw finding
   - only reject/flag incoherent rows
   - never auto-remap category from title/rationale heuristics

## Phase F — Evaluation + Rollout

1. A/B run on golden scripts:
   - `Memory1` vs `Memory2`
2. Metrics:
   - category consistency
   - rationale-evidence coherence
   - wrong-context explanation rate
   - duplicate rate
3. Rollout:
   - shadow mode
   - limited enablement
   - full enablement after KPI pass

## 4) Database Requirements

Minimum:
1. `app_settings` key:
   - `analysis_memory_mode` => `{ "mode": "memory1" | "memory2" }`
2. `analysis_jobs.config_snapshot.analysis_memory_mode` present on creation.

Planned for Phase B+:
1. `analysis_memory_units` (script/scene/chunk memory store)
2. `analysis_memory_traces` (what memory was injected for each chunk/pass)
3. indexes on `(job_id, chunk_id)`, `(script_id, version_id)`, `(scene_id)`

## 5) API/Service Requirements

1. Admin settings endpoint (`/settings/analysis-memory`) with admin-only write.
2. Task/extract job creation must snapshot mode.
3. Worker must route by snapshot.

## 6) UI Requirements

1. Admin Settings dropdown:
   - Memory1 (Current)
   - Memory2 (New)
2. Optional later:
   - show active memory mode in Task detail/report metadata

## 7) Safety + Rollback

1. Mode is runtime-switchable from admin.
2. Existing jobs are immutable by snapshot.
3. Rollback path:
   - switch setting back to `Memory1`
   - no migration rollback needed for control plane

## 8) Next Implementation Tasks

1. Add `Memory2` memory store schema + migration.
2. Implement memory builder for scene/script units.
3. Integrate staged retrieval in `pipelineV2`.
4. Add memory trace writes.
5. Add test pack for wrong-context reasoning regressions.
