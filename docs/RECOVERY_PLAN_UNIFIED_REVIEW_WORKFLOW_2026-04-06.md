# Unified Review Workflow Recovery Plan

Date: 2026-04-06

Status: Execution-ready recovery plan

Owner intent:
- Recover trust in DOCX analysis and review workflow
- Stop drift between report page, workspace, exports, and reanalysis
- Unify Client Analysis and Quick Analysis into one downstream review model

## 1. Executive Summary

The current system does not have a single reviewer-facing source of truth.

Today, findings are represented in three different layers:
- `analysis_findings` as raw occurrence rows
- `analysis_reports.summary_json.canonical_findings` as canonical report cards
- `ScriptWorkspace` fallback/synthetic cards when real rows are missing or incomplete

This causes visible contradictions:
- report page can show correct-looking cards while workspace cards are dead
- workspace selection, `select all`, `mark safe`, and edit behavior depend on real DB rows, but fallback cards may be synthetic
- report counts can diverge from visible cards if they are derived from a different source
- DOCX highlights can navigate to a page but fail to land on an actionable, exact finding row
- reanalysis preserves some manual context, but not the full reviewer-edited state

This recovery plan fixes the system by introducing a new persisted reviewer-facing finding layer and making both Client Analysis and Quick Analysis use the same downstream flow.

## 2. Recovery Strategy Decision

This is a recovery/re-architecture program, not a rewrite from zero and not a continuation of piecemeal patching.

We will:
- keep the working building blocks we already have
- stop mixing report-summary truth with workspace-action truth
- introduce one stable reviewer row per visible finding card
- rebuild workspace/report/export/reanalysis on that reviewer row model

We will not:
- continue expanding synthetic fallback behavior in workspace
- allow report page and workspace to render from different truths
- keep "best effort" interactive cards that cannot be selected, edited, or reviewed reliably

## 3. Current Architecture Audit

### 3.1 Entry Points

Client Analysis:
- scripts are created under standard client/company ownership
- downstream analysis is started through tasks/jobs

Quick Analysis:
- implemented in [supabase/functions/scripts/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/scripts/index.ts)
- `POST /scripts/quick` creates a script with `is_quick_analysis = true`
- quick analysis currently uses `ensureQuickAnalysisClientId(...)` and creates or reuses an internal client row
- quick history is loaded by [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)

Important current fact:
- Quick Analysis already tries to reuse the `scripts` infrastructure, but the frontend/report/export behavior still has quick-specific branches and mappers

### 3.2 Import and Extraction

DOCX / PDF import paths:
- [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- [apps/web/src/utils/documentExtract.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/utils/documentExtract.ts)
- [supabase/functions/extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts)

Current intended DOCX flow:
1. import DOCX
2. create paginated `script_pages`
3. persist `script_text`
4. analyze extracted text
5. use page text for viewer/highlight

Current problem:
- although the system moved closer to page-based review, not all reviewer-facing cards are persisted as actionable rows against those pages

### 3.3 Raw Findings Persistence

Raw machine/manual rows are persisted in:
- `analysis_findings`

Primary writer:
- [apps/worker/src/pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts)

Current raw finding characteristics:
- one row per inserted raw occurrence
- stores article, atom, severity, evidence snippet, global offsets, page number, page-local offsets, anchor payload
- uniqueness enforced by `job_id,evidence_hash` for AI upserts

Manual findings:
- created in [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)
- also stored in `analysis_findings`

### 3.4 Canonical Report Summary

Canonical report cards are built in:
- [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

Current behavior:
- load all `analysis_findings` for a job
- cluster/dedupe/group into `summary_json.canonical_findings`
- write `analysis_reports.summary_json`

Important current fact:
- canonical report cards do not exist as their own persisted actionable table
- they exist as JSON embedded in `analysis_reports`

### 3.5 Report Page

Primary file:
- [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)

Current behavior:
- loads real `findings`
- also loads `summary_json.canonical_findings`
- can prefer canonical UI if real findings are sparse/incomplete
- can render from one source while counting from another if the logic drifts

### 3.6 Workspace

Primary file:
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

Current behavior:
- report selection loads:
  - `findingsApi.getByJob(...)` or `findingsApi.getByReport(...)`
  - report summary via `reportsApi.getByJob(...)` or `reportsApi.getById(...)`
- workspace uses:
  - `reportFindings` from DB
  - `summary_json.canonical_findings` as fallback
- synthetic cards are created when canonical summary exists but real findings are missing or too few

Current problems:
- synthetic cards cannot reliably support checkbox/select-all/edit/review
- clicking can navigate without real exact highlight behavior
- counts and actions may diverge from the report page

### 3.7 Review Actions

Current review actions live in:
- [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)

Current supported operations:
- `POST /findings/review`
- `POST /findings/reclassify`
- `POST /findings/manual`

Current problem:
- these actions mutate `analysis_findings`
- report summary cards are derived later and may not remain a 1:1 representation of what the reviewer edited

### 3.8 Reanalysis

Current carry-forward logic:
- [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)
- current helper: `cloneManualReviewFindingsToJob(...)`

Current problem:
- only a subset of reviewer state is carried forward
- manual findings are partially preserved
- edited AI findings and approved/safe state are not preserved as a single stable reviewer entity

## 4. Core Problem Statement

The system currently has no single persisted reviewer-facing finding entity.

As a result:
- `analysis_findings` are too raw to represent stable report/workspace cards
- `summary_json.canonical_findings` are too embedded/static to support interactive actions
- synthetic fallback cards compensate for missing data but break reviewer trust

Therefore the root fix is:
- create a stable persisted reviewer-facing finding row
- make report page, workspace, export, and reanalysis all consume that row model

## 5. Target Architecture

### 5.1 Source-of-Truth Model

Keep:
- `analysis_findings` = raw detection/occurrence layer
- `analysis_reports` = report snapshot/export summary layer

Add:
- `analysis_review_findings` = reviewer-facing card/action layer

Optional helper:
- `analysis_review_finding_sources` = mapping from reviewer rows to raw occurrence rows

### 5.2 Responsibilities by Layer

`analysis_findings`
- one raw machine/manual occurrence
- useful for clustering, traceability, and debugging
- not used directly as the main reviewer card source

`analysis_review_findings`
- one visible finding card
- actionable
- editable
- selectable
- safe/violation stateful
- anchor-bearing for workspace navigation/highlight

`analysis_reports.summary_json`
- derived snapshot for export, audit, and historical reproduction
- not the primary interactive source

## 6. Proposed Schema

### 6.1 New Table: `analysis_review_findings`

Required columns:
- `id uuid primary key`
- `job_id uuid not null`
- `report_id uuid not null`
- `script_id uuid not null`
- `version_id uuid not null`
- `canonical_finding_id text null`
- `source_kind text not null`
- `primary_article_id int not null`
- `primary_atom_id text null`
- `severity text not null`
- `review_status text not null`
- `title_ar text not null`
- `description_ar text null`
- `rationale_ar text null`
- `evidence_snippet text not null`
- `page_number int null`
- `start_offset_global int null`
- `end_offset_global int null`
- `start_offset_page int null`
- `end_offset_page int null`
- `anchor_status text not null`
- `anchor_method text null`
- `anchor_text text null`
- `anchor_confidence numeric null`
- `is_manual boolean not null default false`
- `manual_comment text null`
- `approved_reason text null`
- `reviewed_by uuid null`
- `reviewed_at timestamptz null`
- `edited_by uuid null`
- `edited_at timestamptz null`
- `created_from_job_id uuid null`
- `supersedes_review_finding_id uuid null`
- `is_hidden boolean not null default false`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Recommended indexes:
- `(report_id)`
- `(job_id)`
- `(script_id, report_id)`
- `(canonical_finding_id)`
- `(review_status)`
- `(source_kind)`

### 6.2 Optional Mapping Table

`analysis_review_finding_sources`
- `review_finding_id uuid not null`
- `analysis_finding_id uuid not null`
- `link_role text not null`

Purpose:
- preserve traceability from reviewer cards back to raw occurrences

## 7. Unified Flow Contract

Both Client Analysis and Quick Analysis must follow this exact downstream contract:

1. Create script shell
2. Create/import version
3. Extract into `script_pages`
4. Use extracted page text as analysis text
5. Run worker and store raw `analysis_findings`
6. Aggregate into canonical findings
7. Materialize `analysis_review_findings`
8. Save `analysis_reports.summary_json`
9. Report page reads `analysis_review_findings`
10. Workspace reads `analysis_review_findings`
11. Reanalysis merges against previous `analysis_review_findings`

Only metadata difference:
- Client Analysis: real `client_id/company_id`
- Quick Analysis: internal or null-equivalent ownership marker

No UI or review behavior difference is allowed after step 1.

## 8. Phase Plan

### Phase 0: Stabilization Freeze

Goal:
- stop further drift while recovery work begins

Actions:
- freeze new synthetic fallback behavior in [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- freeze report/workspace feature additions unrelated to source-of-truth recovery

Exit criteria:
- no new viewer/report branching introduced before the reviewer row model lands

### Phase 1: Repository Audit and Contracts

Goal:
- finish a complete current-state map

Deliverables:
- current source-of-truth matrix
- endpoint matrix
- data ownership map
- reanalysis carry-forward rules currently in production

Files to audit in this phase:
- [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)
- [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)
- [apps/web/src/api/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/api/index.ts)
- [apps/worker/src/pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts)
- [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)
- [supabase/functions/scripts/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/scripts/index.ts)
- [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)
- [supabase/functions/reports/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/reports/index.ts)
- [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)

Exit criteria:
- exact list of all places where report/workspace counts or cards are derived

### Phase 2: Schema Introduction

Goal:
- add reviewer-facing table(s)

Changes:
- add migration for `analysis_review_findings`
- add optional mapping table `analysis_review_finding_sources`
- add server-side read/write helpers

Files:
- new migration under [supabase/migrations](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/migrations)
- update backend selectors in:
  - [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)
  - [supabase/functions/reports/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/reports/index.ts)

Exit criteria:
- schema exists without breaking current production readers

### Phase 3: Materialization at Aggregation Time

Goal:
- ensure every visible finding card exists as a persisted row before report completion

Changes:
- in [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)
  - after `buildSummaryJson(...)`
  - create/update `analysis_review_findings`
  - map canonical findings to reviewer rows
  - store summary snapshot after reviewer rows are written

Important rule:
- `analysis_reports.summary_json.canonical_findings` is now a snapshot of `analysis_review_findings`, not the first place canonical cards exist

Exit criteria:
- all report cards have real reviewer rows

### Phase 4: Workspace Rebuild

Goal:
- remove synthetic reviewer behavior and restore real card interaction

Changes in [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx):
- fetch reviewer rows instead of mixed raw + canonical fallback
- checkbox operates on reviewer row ids
- `Select all` operates on visible reviewer row ids
- `اعتماد كآمن` edits reviewer rows
- edit dialog edits reviewer rows
- manual findings create reviewer rows
- click and highlight use reviewer row anchor fields

Highlight rule:
- `anchor_status = exact` -> exact highlight
- otherwise -> jump to page + manual verification state

Exit criteria:
- no dead cards
- no synthetic cards in main findings workflow
- no select-all mismatch

### Phase 5: Report Page Rebuild

Goal:
- make report page render exactly the same card set as workspace

Changes in [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx):
- fetch and render `analysis_review_findings`
- derive stats from the same rows
- use `summary_json` only for narrative/metadata/export support
- remove mixed-source display logic over time

Exit criteria:
- report counts always match report cards
- report cards correspond 1:1 with workspace cards for the same report

### Phase 6: DOCX Exactness Recovery

Goal:
- make imported DOCX page text the exact analysis and review surface

Changes:
- confirm extraction contracts in:
  - [apps/web/src/utils/documentExtract.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/utils/documentExtract.ts)
  - [supabase/functions/extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts)
  - [supabase/functions/_shared/scriptEditor.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/_shared/scriptEditor.ts)
- ensure worker anchors are resolved against `script_pages.content`
- ensure reviewer rows store final page/global anchor fields

Rule:
- no approximate highlight in reviewer-facing DOCX mode

Exit criteria:
- click card -> exact span or explicit unresolved state

### Phase 7: Review Actions Migration

Goal:
- move review semantics from raw finding rows to reviewer rows

Current actions in [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts):
- review
- reclassify
- manual

New action model:
- review safe/violation updates reviewer row
- reclassify updates reviewer row
- manual creates reviewer row and optional raw evidence link
- aggregate counts recompute from reviewer rows

Raw `analysis_findings` remain:
- evidence/debug layer
- not the primary edited object

Exit criteria:
- user edits persist in the same entity report/workspace render

### Phase 8: Reanalysis Preservation

Goal:
- preserve reviewer intent across reruns

Current state:
- [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts) clones only manual snapshots

Target:
- on rerun, carry forward:
  - manual findings
  - edited findings
  - safe decisions
  - article/atom/severity changes
- match previous reviewer rows using:
  - `canonical_finding_id`
  - page/evidence/anchor fallback
- avoid duplicates

Proposed fields used:
- `supersedes_review_finding_id`
- `created_from_job_id`

Exit criteria:
- rerun preserves reviewer intent

### Phase 9: Export Unification

Goal:
- make export use the same reviewer rows as UI

Files:
- [supabase/functions/reports/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/reports/index.ts)
- [supabase/functions/reports/data-mapper.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/reports/data-mapper.ts)
- [apps/web/src/components/reports/analysis/download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/download.ts)
- [apps/web/src/components/reports/analysis/downloadWord.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/downloadWord.ts)
- [apps/web/src/components/reports/quick-analysis/download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/quick-analysis/download.ts)

Current risk:
- quick-analysis export and full analysis export still have separate mapping behavior

Target:
- one reviewer-row mapping path
- quick/client only differ in branding/metadata, not finding semantics

Exit criteria:
- report page, workspace, PDF export, and annotated export all show the same findings set

### Phase 10: Quick Analysis / Client Analysis Service Unification

Goal:
- remove downstream divergence between the two entry points

Changes:
- keep `POST /scripts/quick` if needed for shell creation
- ensure all downstream APIs operate identically on both script kinds
- remove quick-only finding/report semantics from frontend where possible

Primary files:
- [supabase/functions/scripts/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/scripts/index.ts)
- [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)
- [apps/web/src/api/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/api/index.ts)

Exit criteria:
- same downstream flow, different ownership metadata only

### Phase 11: Rollout and Legacy Compatibility

Goal:
- move safely without breaking historical reports

Plan:
- add feature flag `unified_review_findings`
- support legacy reports in read-only compatibility mode
- enable unified mode for:
  1. internal quick analysis
  2. internal client scripts
  3. selected real client accounts
  4. full production

Exit criteria:
- new runs use unified mode
- old runs remain readable

### Phase 12: UAT and Trust Recovery

Goal:
- prove the system is reliable enough to restore client confidence

Required scenarios:
- old analyzed DOCX
- fresh DOCX
- repeated phrase DOCX
- glossary hits
- manual add
- edit article/sub-article/severity/comment
- select one
- select all
- mark safe
- rerun analysis
- accept/reject/reconsider
- quick analysis path
- client-linked analysis path

Required pass criteria:
- 95% exact DOCX click-to-highlight
- 0 contradictory counts
- 0 dead finding cards
- 0 select-all mismatches
- 0 lost reviewer edits after rerun
- quick/client behave identically after import

## 9. Implementation Order

Recommended order:
1. Phase 1 audit completion
2. Phase 2 schema
3. Phase 3 aggregation materialization
4. Phase 4 workspace rebuild
5. Phase 5 report rebuild
6. Phase 7 review actions migration
7. Phase 8 reanalysis preservation
8. Phase 9 exports
9. Phase 10 quick/client unification cleanup
10. Phase 11 rollout
11. Phase 12 UAT

## 10. Risks and Mitigations

Risk: legacy report pages depend on `summary_json`
- Mitigation: keep summary snapshot, but stop using it as interactive truth for new runs

Risk: current review endpoints mutate raw rows only
- Mitigation: add dual-write period, then migrate reads to reviewer rows

Risk: Quick Analysis internal client id continues to leak into behavior
- Mitigation: treat it as storage metadata only; forbid behavior branching by quick/client after script creation

Risk: DOCX anchors still unresolved for some cases
- Mitigation: exact-or-unresolved rule; no fake highlight

## 11. Definition of Done

The recovery is complete when:
- report page and workspace render from the same persisted reviewer rows
- no synthetic finding cards remain in the main review flow
- counts, cards, actions, and exports are consistent
- reanalysis preserves reviewer edits and manual work
- Quick Analysis and Client Analysis behave the same downstream
- DOCX review flow reaches trustable 95% exactness

## 12. Immediate Next Step

Start Phase 1 as a codebase audit deliverable:
- produce a source-of-truth matrix
- list all readers/writers of raw findings, canonical summary findings, and reviewer actions
- identify the minimum migration path to `analysis_review_findings`

This document is the execution baseline for that work.
