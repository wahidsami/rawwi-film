# V4 Runtime Orchestrator

This is the compact runtime summary for the Shadow completion lifecycle in Raawi V4.

## Purpose

The runtime orchestrator connects the existing V4 outputs into one completed shadow artifact set after the V4 node graph finishes.

It does not change reasoning, prompting, legal mapping, explanation logic, or judging.

## Where It Lives

- `apps/worker/src/analysisEngineV4/runtime/runtimeOrchestrator.ts`
- `apps/worker/src/analysisEngineV4/runtime/runtimeArtifacts.ts`
- `apps/worker/src/analysisEngineV4/runtime/runtimeBundle.ts`
- `apps/worker/src/analysisEngineV4/runtime/runtimePersistence.ts`

## Execution Order

After background V4 finishes:

1. Normalize the V4 trace document.
2. Rebuild the V4 report adapter result.
3. Reuse the decision provenance collection.
4. Build the cognitive dashboard.
5. Run the benchmark framework.
6. Build runtime metrics.
7. Build the investigation bundle metadata.
8. Persist the runtime artifacts through shadow persistence.
9. Return the completed runtime object.

## Returned Runtime Object

The orchestrator returns one object shaped like:

```ts
{
  engine,
  runtime,
  benchmark,
  dashboard,
  trace,
  report,
  provenance,
  metrics,
  bundle
}
```

## Persisted Artifacts

The orchestrator persists the runtime bundle through the existing shadow JSON path:

- `analysis_chunk_runs.truth_layer_meta.runtime_orchestrator`
- `analysis_chunk_runs.truth_layer_meta.investigation_bundle`
- `analysis_chunk_runs.truth_layer_meta.runtime`
- `analysis_chunk_runs.truth_layer_meta.benchmark`
- `analysis_chunk_runs.truth_layer_meta.dashboard`
- `analysis_chunk_runs.truth_layer_meta.report`
- `analysis_chunk_runs.truth_layer_meta.provenance`
- `analysis_chunk_runs.truth_layer_meta.metrics`
- `analysis_chunk_runs.truth_layer_meta.trace_document`

It also keeps the existing shadow payload fields:

- `analysis_chunk_runs.raw_ai_findings`
- `analysis_chunk_runs.validated_ai_findings`
- `analysis_chunk_runs.ai_findings`
- `analysis_engine_evaluations`

## Artifacts Included In The Bundle

The investigation bundle references:

- V3 report
- V4 report
- benchmark
- trace
- dashboard
- decision provenance
- runtime metrics
- token usage
- cost estimates
- execution timings

## Shadow Mode Lifecycle

Current shadow completion flow:

1. Visible V3 analysis runs.
2. Background V4 analysis runs.
3. Runtime orchestrator builds the full V4 evaluation bundle.
4. Runtime artifacts are persisted.
5. Shadow execution finishes.

## What This Does Not Change

- V3 behavior
- prompts
- Academy
- legal mapping
- explanation logic
- quality judge
- report rendering
- Trace Viewer behavior

## What Is Still Standalone

- Human evaluation
- Regression suite
- Standalone benchmark execution outside shadow mode
- Cognitive dashboard outside shadow mode

