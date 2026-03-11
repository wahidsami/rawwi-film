# Analysis V2 Baseline Audit

## Scope
This document captures the current detector-first pipeline and the new instrumentation hooks added for Hybrid V3 rollout.

## Current V2 Flow
1. Worker loop claims chunk in `apps/worker/src/index.ts`.
2. `processChunkJudge()` in `apps/worker/src/pipeline.ts`:
   - injects lexicon terms into prompts,
   - runs deterministic lexicon matching,
   - runs multipass AI detection,
   - deduplicates and upserts findings.
3. `runAggregation()` in `apps/worker/src/aggregation.ts` composes report summary.

## Why false positives happen in V2
- Prompts are tuned to maximum recall and low tolerance for context.
- Chunk-level passes can detect terms without script-level consequence framing.
- Overlapping article domains can produce duplicated/contradictory severity interpretations.

## Instrumentation Hooks Added
- Extended `JudgeFinding` schema in `apps/worker/src/schemas.ts` with optional fields:
  - `depiction_type`, `speaker_role`, `narrative_consequence`,
  - `context_window_id`, `context_confidence`,
  - `lexical_confidence`, `policy_confidence`,
  - `rationale_ar`, `final_ruling`, `detection_pass`.
- Added contradiction metrics in `apps/worker/src/pipeline.ts`:
  - `contradictionGroups`,
  - `severeDisagreementGroups`.
- Added `analysis_engine_evaluations` persistence for shadow/enforce comparison.

## Compatibility Notes
- Existing report shape is preserved.
- New context fields are optional and stored in `location.v3` JSON metadata.
