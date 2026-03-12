# Sanity Check: Analysis Options (بطاقة لكل موقع vs بطاقة لكل ظهور)

This document summarizes the verification of both analysis options (merge strategies) for **normal script analysis** and **quick analysis**, and confirms there are no gaps in the flow.

---

## 1. Flow Overview

| Step | Normal analysis | Quick analysis | Notes |
|------|------------------|-----------------|--------|
| **Entry** | ScriptWorkspace (script linked to client) | QuickAnalysis upload → redirect to ScriptWorkspace with `?quick=1` | Both use ScriptWorkspace to start analysis |
| **Start analysis** | User clicks "بدء التحليل" → `handleStartAnalysis()` | Same button, same handler | Single code path |
| **Options modal** | `setAnalysisOptionsModalOpen(true)` | Same modal | User always sees the two options |
| **Submit** | `handleStartAnalysisWithOptions()` → `scriptsApi.createTask(versionId, { forceFresh: true, analysisOptions: { mergeStrategy } })` | Same call | `mergeStrategy` is always sent (either `same_location_only` or `every_occurrence`) |
| **Edge function** | POST `/tasks` with `body.analysisOptions` | Same endpoint, same body | `config_snapshot.analysisOptions` stored on job |
| **Worker aggregation** | `runAggregation(jobId)` loads job with `config_snapshot`, passes `analysisOptions` to `buildSummaryJson` | Same worker, same aggregation | No distinction between quick and normal |
| **Report** | `summary_json` with `canonical_findings` built from chosen strategy | Same | UI and PDF consume `summary_json` |

**Conclusion:** Both analysis types use the **same pipeline**. The chosen option is stored on the job and applied at aggregation time. There is no separate code path for quick analysis that would skip or ignore the option.

---

## 2. Option Behaviour (Backend)

### 2.1 Stored value

- **Edge function** (`supabase/functions/tasks/index.ts`):
  - Reads `body.analysisOptions.mergeStrategy`.
  - Normalizes to `every_occurrence` only when value is exactly `"every_occurrence"`; otherwise uses `same_location_only`.
  - Saves in `config_snapshot.analysisOptions` when creating the job.

### 2.2 Aggregation (`apps/worker/src/aggregation.ts`)

- **Read:** `analysisOptions = job.config_snapshot?.analysisOptions`
- **Default when missing (e.g. old jobs):** `analysisOptions` is `undefined` → treated as **same_location_only** (one card per location, overlap 0.85).
- **same_location_only:**
  - `overlapRatio = 0.85`
  - `oneCardPerOccurrence = false`
  - Clusters built with `clusterByOverlap(deduped, 0.85)` so only findings with high span overlap merge into one card.
- **every_occurrence:**
  - `oneCardPerOccurrence = true`
  - No overlap clustering: `clusters = new Map(deduped.map((f, i) => [i, [f]]))` → one cluster per deduped finding.
  - Canonical id format: `CF-every-${clusterIndex}-${primary.article_id}` so each card is unique.

So both options are implemented and applied correctly; behaviour matches the UI labels.

---

## 3. UI and Export

- **Results page:** Uses `summary.canonical_findings` and `summary.report_hints` from the report. No re-clustering; display matches what was aggregated.
- **Normal PDF:** Uses `canonicalFindings` from the same summary → same cards as UI.
- **Quick PDF:** Uses `canonicalFindings` and `reportHints` from the same summary → same cards and notes as UI.

So for both normal and quick analysis, the chosen option is reflected in the report and in both PDFs.

---

## 4. Edge Cases Checked

| Case | Result |
|------|--------|
| Job created without `analysisOptions` (e.g. old job) | `analysisOptions` is `undefined` → default **same_location_only**. No crash. |
| `mergeStrategy` typo or unknown value from client | Edge function normalizes to `same_location_only`. Safe. |
| Quick analysis started from ScriptWorkspace | Same modal and same `createTask(..., analysisOptions)` as normal. Option is stored and used. |
| Chunk cache / run_key | Chunk cache does not depend on merge strategy. Aggregation re-reads `config_snapshot` and applies the option when building the summary. Correct. |
| Report already exists (e.g. re-run aggregation) | Aggregation exits early and does not overwrite; report was built with the option that was on the job at creation. Consistent. |

---

## 5. Potential Improvements (Optional)

1. **Persistence of last choice:** The modal always opens with the default `same_location_only`. Storing the user’s last choice (e.g. in localStorage or user settings) would improve UX; behaviour is already correct.
2. **Explicit default in edge function:** If `body.analysisOptions` is missing, the edge function could set `analysisOptions: { mergeStrategy: "same_location_only" }` so every job has an explicit value; aggregation already treats missing as same_location_only.

---

## 6. Summary

- **Both options work as intended** for normal and quick analysis.
- **Single path:** Analysis is always started from ScriptWorkspace with the options modal; both script types use the same task creation and worker aggregation.
- **Backend:** Option is stored in `config_snapshot.analysisOptions` and applied in `buildSummaryJson` (clustering vs one-card-per-occurrence).
- **UI and PDF:** Report and both PDF exports use the aggregated summary; no extra logic that could override or ignore the option.
- **Old jobs:** Missing `analysisOptions` defaults to one card per location (0.85 overlap), which is the recommended default.

No issues found that would make either option or either analysis type behave incorrectly.
