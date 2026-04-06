# Recovery Phase 1: Source-of-Truth Matrix

Date: 2026-04-06

Purpose:
- document exactly where findings and report data are created, stored, rendered, edited, and counted today
- identify where the system currently uses more than one source of truth
- provide the minimum factual baseline before implementing the new reviewer-facing finding layer

## 1. Core Data Objects in the Current System

### `scripts`
Meaning:
- the document/review container used by both Client Analysis and Quick Analysis

Writers:
- [supabase/functions/scripts/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/scripts/index.ts)

Readers:
- [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- [apps/web/src/api/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/api/index.ts)

Notes:
- Quick Analysis is currently implemented as a script with `is_quick_analysis = true`
- Quick Analysis still uses an internal client shell through `ensureQuickAnalysisClientId(...)`

### `script_text`
Meaning:
- extracted plain text for a script version

Writers:
- [supabase/functions/extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts)

Readers:
- worker analysis pipeline
- manual finding creation in [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)

Notes:
- used as the canonical full-text source for offsets

### `script_pages`
Meaning:
- paginated extracted viewer pages

Writers:
- [supabase/functions/extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts)
- DOCX path also relies on [apps/web/src/utils/documentExtract.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/utils/documentExtract.ts)

Readers:
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- worker page-local anchor computation in [apps/worker/src/pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts)
- aggregation report hints in [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

Notes:
- this is the viewer surface for DOCX review
- this should also be the analysis surface for DOCX review

### `analysis_jobs`
Meaning:
- analysis run container

Writers:
- task creation paths in [apps/web/src/api/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/api/index.ts)
- [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)

Readers:
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)
- [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

Notes:
- currently the job is the bridge between raw findings and report generation

### `analysis_findings`
Meaning:
- raw machine/manual finding rows

Writers:
- AI rows: [apps/worker/src/pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts)
- manual rows: [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)
- reanalysis carry-forward of manual rows: [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)

Readers:
- aggregation: [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)
- workspace/report APIs: [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)
- report PDF API path: [supabase/functions/reports/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/reports/index.ts)

Notes:
- currently also used as the editable review object
- this is one of the main root causes of drift

### `analysis_reports.summary_json.canonical_findings`
Meaning:
- canonical report-card summary generated at aggregation time

Writer:
- [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

Readers:
- [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- report exports:
  - [apps/web/src/components/reports/analysis/download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/download.ts)
  - [apps/web/src/components/reports/analysis/downloadWord.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/downloadWord.ts)
  - [apps/web/src/components/reports/quick-analysis/download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/quick-analysis/download.ts)

Notes:
- currently treated as interactive truth in some UI fallback paths
- but it is only a report snapshot, not an actionable persisted reviewer entity

## 2. Current Writers and Readers by User Journey

## Import and Extraction

Current writer chain:
1. [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx) or client/script upload path creates script/version
2. [supabase/functions/extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts) persists `script_text` and `script_pages`

Current reader chain:
- workspace viewer
- worker analysis
- manual finding placement

Current status:
- mostly coherent for import/storage

## AI Analysis Run

Current writer chain:
1. [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts) creates jobs/chunks
2. [apps/worker/src/pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts) inserts raw `analysis_findings`
3. [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts) builds `analysis_reports.summary_json`

Current reader chain:
- report page
- workspace
- exports

Current status:
- two truths exist after aggregation:
  - raw rows in `analysis_findings`
  - canonical cards in `summary_json`

## Report Page

Primary reader:
- [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)

Current sources used:
- `findings` loaded via `findingsApi`
- `canonicalSummaryFindings` loaded from `report.summaryJson`
- `reportHints`
- `wordsToRevisit`

Current branching:
- can use real findings UI
- can prefer canonical summary UI if DB findings are sparse

Current problem:
- report cards and counts can be driven by a different source than workspace cards and actions

## Workspace

Primary reader:
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

Current sources used:
- `reportFindings` loaded from `findingsApi.getByJob(...)` or `getByReport(...)`
- `workspaceCanonicalSummaryFindings` loaded from `selectedReportSummary.summaryJson.canonical_findings`
- synthetic rows created via `synthesizeWorkspaceFindingFromCanonical(...)`

Current branching:
- if enough DB findings exist -> use DB rows
- if too few exist -> use canonical fallback cards

Current problem:
- only real DB findings are fully actionable
- fallback cards are partially interactive at best
- highlight behavior and selection can drift

## Manual Findings

Current writer:
- [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)

Current storage:
- inserted directly into `analysis_findings`

Current problem:
- manual findings live in the raw table
- there is no separate reviewer-card table that all UI paths consume

## Reclassification / Mark Safe

Current writer:
- [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)

Current storage:
- updates raw `analysis_findings`
- recomputes parts of `analysis_reports.summary_json`

Current problem:
- summary is recomputed after edits, but the edited object is still the raw row
- canonical cards are not their own persisted review rows

## Reanalysis

Current writer/clone logic:
- [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)

Current preserved state:
- manual review snapshot and cloned manual rows

Current missing state:
- full edited reviewer card state
- unified safe/violation decisions on canonical card entities
- stable non-duplicated carry-forward of modified AI findings

## 3. Current Source-of-Truth Matrix

| Concern | Current primary source | Current fallback/secondary source | Writers | Main readers | Current risk |
|---|---|---|---|---|---|
| Raw detection evidence | `analysis_findings` | none | worker/manual APIs | aggregation, findings APIs | low |
| Canonical report cards | `analysis_reports.summary_json.canonical_findings` | `findings_by_article` | aggregation | Results, Workspace fallback, exports | high |
| Workspace action cards | `analysis_findings` | synthetic canonical fallback cards | findings API + frontend synthesis | ScriptWorkspace | critical |
| Highlight anchors | `analysis_findings` anchor fields | workspace search / fallback matching | worker/manual APIs | ScriptWorkspace | critical |
| Report stats | mixed: `findings` or `canonical_findings` | report hints | Results | Results | critical |
| Workspace counts | mixed: DB findings or visible fallback list | none | ScriptWorkspace state | ScriptWorkspace | critical |
| Select/select-all | real `analysis_findings` ids | synthetic ids in fallback mode | ScriptWorkspace state | ScriptWorkspace | critical |
| Mark safe / edit | `analysis_findings` | none | findings edge function | ScriptWorkspace, Results | high |
| Manual findings | `analysis_findings` | summary refresh | findings edge function | ScriptWorkspace, Results | high |
| Reanalysis persistence | partial manual snapshot | none | tasks edge function | next job/report | critical |
| PDF/Word exports | mixed real findings / canonical summary | article summary | web report exporters and report function | exports | high |

## 4. Conflict Points

### Conflict A: One card, two identities

What happens now:
- report page can show canonical card
- workspace may try to find a matching raw row
- if no row exists, frontend synthesizes one

Why this is bad:
- checkbox/select-all/review/edit require stable row identity
- synthetic cards are not stable reviewer entities

### Conflict B: Counts from one source, cards from another

What happens now:
- counts may come from canonical summary while actions depend on raw findings

Why this is bad:
- user sees `13 findings`
- but workspace acts on only `1` actionable row

### Conflict C: Reanalysis only carries partial reviewer intent

What happens now:
- manual rows are cloned forward
- edited/safe state of canonical cards is not preserved as a single stable reviewer entity

Why this is bad:
- user loses trust that edits are durable

### Conflict D: Quick Analysis is storage-compatible but not semantically unified

What happens now:
- quick analysis uses script infrastructure
- but still has separate report/export shaping paths and historically different handling

Why this is bad:
- bugs get fixed twice or drift apart

## 5. Required Recovery Direction

The system needs one new persisted source:
- `analysis_review_findings`

It should become the single source for:
- report cards
- workspace cards
- counts
- selection
- mark safe
- edit
- manual findings
- reanalysis carry-forward
- exports

`analysis_findings` remains:
- raw detection layer
- useful for traceability and clustering

`summary_json.canonical_findings` remains:
- snapshot/export layer
- not primary interactive truth

## 6. Immediate Phase 1 Conclusion

The current system is not broken because one component is wrong.

It is broken because:
- interactive review behavior currently spans multiple data sources
- those sources were designed for different purposes

This matrix confirms that recovery must:
- add a reviewer-facing finding table
- move all interactive review concerns onto that table
- keep raw findings and summary JSON as supporting layers only

