# V4 Runtime Architecture

This document is the canonical reference for the current Raawi V4 runtime shape.

It is intentionally read-only. It describes the runtime as it exists today, based on the current worker implementation and the verified compile pass.

## Current State

- `npx tsc -p apps/worker/tsconfig.json --noEmit` passes.
- V3 remains the visible production engine by default.
- V4 can run in a parallel shadow path, but it does not replace V3.
- The standalone benchmark, regression, dashboard, and human-evaluation tools are not auto-wired into production job completion.

## 1. Engine Selection

### Entry points

- `apps/worker/src/config.ts`
- `apps/worker/src/analysisEngine/engineFactory.ts`
- `apps/worker/src/pipeline.ts`

### Environment variables

- `ANALYSIS_ENGINE`
  - accepted values: `v3`, `v4`, `shadow`
  - default: `v3`
  - factory behavior:
    - `v4` selects the V4 adapter
    - everything else selects the V3 adapter
- `V4_SHADOW_MODE`
  - when enabled, the worker schedules the V4 shadow path after the visible result returns
- `ENABLE_FINDING_LINEAGE`
  - controls optional lineage event persistence
- `ENABLE_AI_DIAGNOSTICS`
  - controls diagnostics metadata
- `OPENAI_API_KEY`
  - enables the live OpenAI-backed branch inside V4 `interpret_scene`

### Actual selection behavior

`ANALYSIS_ENGINE=shadow` does **not** make the factory return the V4 adapter.

Instead:

1. `pipeline.ts` resolves `analysisEngine = "shadow"`.
2. `createAnalysisEngine().execute(...)` runs.
3. `engineFactory.create()` treats `"shadow"` as V3.
4. The visible result is still produced by the V3 adapter.
5. `runV4ShadowMode(...)` is scheduled asynchronously.
6. The shadow path runs independently in the background.

## 2. Visible Runtime Flow

### Main visible path

File: `apps/worker/src/pipeline.ts`

The visible worker flow for the analysis job is:

1. Resolve job config and engine mode.
2. Load cached job resources.
3. Run the visible analysis engine through `createAnalysisEngine().execute(...)`.
4. Persist the visible findings and report through the existing production pipeline.
5. Mark the chunk/job complete.

When `analysisEngine === "shadow"`:

- the visible run still completes through the V3 adapter,
- the shadow V4 run is launched with `void runV4ShadowMode(...)`,
- the visible job does not wait for the V4 shadow result.

### Actual order

The actual runtime order is:

1. `engineFactory.create()`
2. V3 adapter execution for the visible result
3. visible persistence and report completion
4. asynchronous V4 shadow execution
5. shadow comparison
6. shadow persistence

This is **not** a blocking `V3 -> V4 -> Benchmark -> Persist -> Complete Job` chain.

## 3. V3 Adapter

### File

- `apps/worker/src/analysisEngine/analysisEngineV3Adapter.ts`

### Responsibility

- Wrap the existing V3 runtime.
- Preserve behavior exactly.
- Return the same `AnalysisResult` contract.

### Production role

This is the engine used for visible production output unless `ANALYSIS_ENGINE=v4`.

## 4. V4 Adapter

### File

- `apps/worker/src/analysisEngine/analysisEngineV4Adapter.ts`

### Responsibility

- Execute the V4 scene-analysis graph.
- Build the V4 report adapter.
- Build the decision provenance collection.
- Attach trace and report objects to `truthLayerMeta`.

### V4 node graph order

File: `apps/worker/src/analysisEngineV4/sceneAnalysisEngine.ts`

Execution order:

1. `understand_scene`
2. `interpret_scene`
3. `candidate_evidence`
4. `concept_classification`
5. `legal_mapping`
6. `explanation`
7. `quality_judge`
8. `finalize`

### Important note

`interpret_scene` is the only V4 node that may call OpenAI.
If `OPENAI_API_KEY` is absent, it falls back to deterministic interpretation.

## 5. V4 Report

### Files

- `apps/worker/src/analysisEngineV4/report/reportBuilder.ts`
- `apps/worker/src/analysisEngineV4/report/reportAdapter.ts`
- `apps/worker/src/analysisEngine/analysisEngineV4Adapter.ts`

### What it produces

The V4 adapter currently builds:

- `analysis_report`
- `decision_provenance`
- `report_adapter`
- `scene_analysis_trace`

These are attached inside the V4 `truthLayerMeta`.

### Storage location

There is no standalone V4 report table in the normal runtime path.

Current storage is:

- in-memory on the returned V4 `AnalysisResult`
- nested inside the shadow truth layer when shadow mode persists `analysis_chunk_runs.truth_layer_meta.shadow_truth_layer_meta`

## 6. Shadow Mode

### Files

- `apps/worker/src/analysisEngineV4/shadow/shadowExecutor.ts`
- `apps/worker/src/analysisEngineV4/shadow/shadowPersistence.ts`
- `apps/worker/src/pipeline.ts`

### What it does

Shadow mode runs V4 asynchronously after the visible V3 result is returned.

It:

- executes the V4 adapter,
- compares V3 vs V4,
- estimates runtime/token/cost metrics,
- persists shadow artifacts.

### Persisted shadow artifacts

Shadow persistence currently writes to:

- `analysis_chunk_runs`
- `analysis_engine_evaluations`

The V4 report, provenance, and trace are nested inside `analysis_chunk_runs.truth_layer_meta.shadow_truth_layer_meta`.

## 7. Trace Viewer

### Files

- `apps/worker/src/analysisEngineV4/sceneAnalysisTraceViewer.ts`
- `apps/worker/src/analysisEngineV4/shadow/shadowPersistence.ts`

### What it does

The Trace Viewer is observational only.

It serializes:

- scene model snapshots
- evidence snapshots
- concept snapshots
- legal decision snapshots
- explanation snapshots
- verified finding snapshots
- provenance snapshots

### Storage

- In the V4 adapter result: `truthLayerMeta.scene_analysis_trace`
- In Shadow Mode: nested inside `analysis_chunk_runs.truth_layer_meta.shadow_truth_layer_meta.trace_document`

### Behavior guarantee

The Trace Viewer does not mutate runtime state and does not influence provider output.

## 8. Benchmark Framework

### Files

- `apps/worker/src/analysisEngineV4/benchmark/benchmarkRunner.ts`
- `apps/worker/src/analysisEngineV4/benchmark/benchmarkPersistence.ts`
- `apps/worker/src/analysisEngineV4/benchmark/benchmarkReport.ts`
- `apps/worker/src/analysisEngineV4/benchmark/benchmarkRenderer.ts`

### Entry point

- `runSceneAnalysisBenchmark(...)`

### Status

This framework is standalone.

It is **not** automatically invoked by Shadow Mode or by the production worker job lifecycle.

### Output

If the caller provides output paths, the benchmark can write:

- markdown report
- JSON report
- trace JSON

There is no automatic production benchmark artifact flow today.

## 9. Regression Framework

### Files

- `apps/worker/src/analysisEngineV4/regression/regressionRunner.ts`
- `apps/worker/src/analysisEngineV4/regression/goldenDataset.ts`
- `apps/worker/src/analysisEngineV4/regression/regressionReport.ts`

### Entry point

- `runRegressionSuite(...)`

### Status

Standalone only.

It is not automatically triggered by Shadow Mode or benchmark completion.

### Golden dataset

The golden dataset is stored in code:

- `apps/worker/src/analysisEngineV4/regression/goldenDataset.ts`

## 10. Human Evaluation

### Files

- `apps/worker/src/analysisEngineV4/evaluation/evaluationSession.ts`
- `apps/worker/src/analysisEngineV4/evaluation/evaluationReport.ts`

### Entry point

- `runHumanEvaluationSession(...)`

### Status

Standalone only.

It is not wired into Shadow Mode.

## 11. Cognitive Dashboard

### Files

- `apps/worker/src/analysisEngineV4/dashboard/cognitiveDashboard.ts`

### Entry point

- `buildCognitiveDashboard(...)`

### Status

Read-only developer tooling.

It is not auto-generated for completed production jobs.

### Output

The builder returns an in-memory dashboard object with HTML and JSON views.

## 12. Provenance Graph

### Files

- `apps/worker/src/analysisEngineV4/provenance/decisionProvenanceBuilder.ts`
- `apps/worker/src/analysisEngineV4/provenance/decisionProvenanceGraph.ts`
- `apps/worker/src/analysisEngineV4/provenance/decisionProvenanceNode.ts`

### What it records

The provenance layer records lineage only.

It does not change findings.

It connects:

- evidence
- concept
- legal decision
- explanation
- verified finding

### Replay chain

The provenance graph makes it possible to replay a finding backwards from the verified finding to:

1. explanation
2. legal decision
3. concept
4. evidence
5. original screenplay offsets

## 13. Persistence Map

### Visible production persistence

The visible job path persists through the existing V3 pipeline:

- `analysis_findings`
- `analysis_reports`
- `analysis_chunk_runs`

### Shadow persistence

Shadow mode persists:

- `analysis_chunk_runs`
- `analysis_engine_evaluations`

and embeds the V4 data inside the shadow truth layer JSON.

### Optional lineage persistence

If enabled, lineage events persist through:

- `analysis_finding_lineage_events`

via `apps/worker/src/findingLineage.ts`.

## 14. Runtime Artifact Summary

For a completed shadow job, you should expect:

- visible V3 findings
- visible V3 report
- visible chunk-run row
- shadow chunk-run row
- shadow comparison summary
- V4 trace document nested in shadow truth meta
- V4 report adapter payload nested in shadow truth meta
- V4 provenance report nested in shadow truth meta
- runtime, token, and cost estimates nested in shadow truth meta
- optional lineage events if enabled

What you should **not** expect today:

- a dedicated V4 report table
- automatic benchmark files from production shadow jobs
- automatic dashboard artifacts
- automatic regression artifacts
- V4 changing the visible V3 report

## 15. What Is Still Missing

These are the remaining runtime gaps before V4 can be fairly benchmarked against V3:

- The standalone benchmark runner is not automatically wired into the shadow job lifecycle.
- There is no dedicated production retrieval contract for benchmark artifacts after a job completes.
- The cognitive dashboard is not automatically generated or persisted for completed jobs.
- Human evaluation remains standalone only.
- Regression execution remains standalone only.
- The V4 `interpret_scene` OpenAI-backed branch still depends on `OPENAI_API_KEY`, so benchmark fairness depends on controlling that runtime dependency.

## 16. File Index

- `apps/worker/src/config.ts` - runtime flags and engine defaults.
- `apps/worker/src/pipeline.ts` - visible job orchestration and shadow scheduling.
- `apps/worker/src/analysisEngine/engineFactory.ts` - engine selection.
- `apps/worker/src/analysisEngine/analysisEngineV3Adapter.ts` - V3 wrapper.
- `apps/worker/src/analysisEngine/analysisEngineV4Adapter.ts` - V4 wrapper and truth-layer assembly.
- `apps/worker/src/analysisEngineV4/sceneAnalysisEngine.ts` - V4 graph orchestration.
- `apps/worker/src/analysisEngineV4/sceneAnalysisTraceViewer.ts` - read-only trace serialization.
- `apps/worker/src/analysisEngineV4/report/reportBuilder.ts` - V4 report adapter.
- `apps/worker/src/analysisEngineV4/provenance/decisionProvenanceBuilder.ts` - decision lineage graph/report.
- `apps/worker/src/analysisEngineV4/shadow/shadowExecutor.ts` - background V4 shadow execution.
- `apps/worker/src/analysisEngineV4/shadow/shadowPersistence.ts` - shadow DB persistence.
- `apps/worker/src/analysisEngineV4/benchmark/benchmarkRunner.ts` - standalone benchmark runner.
- `apps/worker/src/analysisEngineV4/regression/regressionRunner.ts` - standalone regression runner.
- `apps/worker/src/analysisEngineV4/evaluation/evaluationSession.ts` - standalone human evaluation.
- `apps/worker/src/analysisEngineV4/dashboard/cognitiveDashboard.ts` - read-only dashboard builder.
- `apps/worker/src/findingLineage.ts` - optional lineage persistence.

## 17. Final Runtime Conclusion

The current runtime is a **parallel V3 production engine with an optional background V4 shadow path**.

V3 still owns the visible user-facing result.
V4 currently provides:

- a deterministic node graph,
- trace and provenance capture,
- a report adapter,
- shadow comparisons,
- standalone benchmark/regression/evaluation/dashboard tooling.

The shadow path does not replace production V3 behavior.
