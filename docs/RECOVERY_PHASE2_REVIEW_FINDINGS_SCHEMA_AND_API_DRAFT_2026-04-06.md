# Recovery Phase 2: `analysis_review_findings` Schema and API Draft

Date: 2026-04-06

Purpose:
- define the reviewer-facing data model
- define how it relates to existing raw findings and reports
- define the minimum API/backend/frontend changes needed before implementation

## 1. Design Goal

Introduce a new persisted entity:
- `analysis_review_findings`

This entity represents:
- one visible finding card
- one selectable unit
- one editable unit
- one review decision unit
- one highlight/navigation target

This table does not replace raw findings.

Instead:
- `analysis_findings` stays the raw evidence/detection layer
- `analysis_review_findings` becomes the reviewer-facing action layer
- `analysis_reports.summary_json` becomes the snapshot/export layer

## 2. Proposed Table: `analysis_review_findings`

## Identity and ownership
- `id uuid primary key default gen_random_uuid()`
- `job_id uuid not null references analysis_jobs(id) on delete cascade`
- `report_id uuid not null references analysis_reports(id) on delete cascade`
- `script_id uuid not null references scripts(id) on delete cascade`
- `version_id uuid not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## Canonical linkage
- `canonical_finding_id text null`
- `source_kind text not null`

Recommended `source_kind` values:
- `ai`
- `glossary`
- `manual`
- `special`

## Policy/reviewer-visible classification
- `primary_article_id int not null`
- `primary_atom_id text null`
- `severity text not null`
- `review_status text not null default 'violation'`

Recommended `review_status` values:
- `violation`
- `approved`
- `needs_review`

## Reviewer-visible text
- `title_ar text not null`
- `description_ar text null`
- `rationale_ar text null`
- `evidence_snippet text not null`
- `manual_comment text null`

## Anchor fields
- `page_number int null`
- `start_offset_global int null`
- `end_offset_global int null`
- `start_offset_page int null`
- `end_offset_page int null`
- `anchor_status text not null default 'unresolved'`
- `anchor_method text null`
- `anchor_text text null`
- `anchor_confidence numeric null`

Recommended `anchor_status` values:
- `exact`
- `unresolved`

## Review/edit metadata
- `is_manual boolean not null default false`
- `is_hidden boolean not null default false`
- `approved_reason text null`
- `reviewed_by uuid null`
- `reviewed_at timestamptz null`
- `edited_by uuid null`
- `edited_at timestamptz null`

## Reanalysis lineage
- `created_from_job_id uuid null references analysis_jobs(id) on delete set null`
- `supersedes_review_finding_id uuid null references analysis_review_findings(id) on delete set null`

## Recommended indexes
- `idx_arf_report_id(report_id)`
- `idx_arf_job_id(job_id)`
- `idx_arf_script_id(script_id)`
- `idx_arf_canonical_finding_id(canonical_finding_id)`
- `idx_arf_review_status(review_status)`
- `idx_arf_source_kind(source_kind)`
- `idx_arf_script_report_status(script_id, report_id, review_status)`

## 3. Optional Link Table: `analysis_review_finding_sources`

Purpose:
- allow reviewer cards to trace back to one or more raw `analysis_findings`

Columns:
- `review_finding_id uuid not null references analysis_review_findings(id) on delete cascade`
- `analysis_finding_id uuid not null references analysis_findings(id) on delete cascade`
- `link_role text not null default 'primary'`
- `created_at timestamptz not null default now()`

Recommended uniqueness:
- `(review_finding_id, analysis_finding_id)`

This is optional but strongly recommended.

## 4. Lifecycle Contract

### 4.1 New analysis job
1. worker inserts raw `analysis_findings`
2. aggregation clusters canonical findings
3. aggregation materializes `analysis_review_findings`
4. report snapshot is written from those reviewer rows

### 4.2 Report page
- report cards are loaded from `analysis_review_findings`
- counts are derived from `analysis_review_findings`
- `summary_json` remains summary/export support only

### 4.3 Workspace
- findings tab loads `analysis_review_findings`
- click/select/edit/review operate on `analysis_review_findings`
- no synthetic reviewer cards in normal operation

### 4.4 Manual finding
- creates a reviewer row in `analysis_review_findings`
- may also create a raw row in `analysis_findings` for traceability

### 4.5 Reclassify / mark safe
- updates reviewer row first
- raw rows remain evidence, not the primary review object

### 4.6 Reanalysis
- previous reviewer rows are matched and carried forward
- new reviewer rows supersede old ones when necessary
- reviewer intent remains stable across reruns

## 5. Minimal Backend Changes

## 5.1 Aggregation

File:
- [apps/worker/src/aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

Add:
- `materializeReviewFindings(jobId, reportId, summary, rawFindings)`

Responsibilities:
- transform `summary.canonical_findings` into persisted reviewer rows
- write row-level anchors from best available canonical anchor data
- link back to raw `analysis_findings` when possible

Important:
- report upsert should happen after reviewer rows exist, or within the same transaction/unit of work if feasible

## 5.2 Findings Edge Function

File:
- [supabase/functions/findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)

Needed changes:
- new reader endpoints for reviewer rows
- review/reclassify/manual should target reviewer rows
- aggregate recomputation should derive report totals from reviewer rows, not raw rows

Suggested API additions:
- `GET /findings/review-layer?jobId=...`
- `GET /findings/review-layer?reportId=...`
- `POST /findings/review-row/review`
- `POST /findings/review-row/reclassify`
- `POST /findings/review-row/manual`

Transitional option:
- keep current endpoint names but switch implementation internally to reviewer rows

## 5.3 Reports Edge Function

File:
- [supabase/functions/reports/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/reports/index.ts)

Needed changes:
- list/report DTOs may keep current shape
- single report payload should include reviewer-row-based counts
- exports should read reviewer rows

## 5.4 Tasks Edge Function

File:
- [supabase/functions/tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)

Needed changes:
- replace partial manual-only carry-forward with reviewer-row carry-forward
- add matching/merge logic for reanalysis

## 5.5 Scripts Edge Function

File:
- [supabase/functions/scripts/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/scripts/index.ts)

Needed changes:
- no major schema change required for quick analysis entry creation
- but downstream review behavior must stop branching by quick/client semantics

## 6. Minimal Frontend Changes

## 6.1 API layer

File:
- [apps/web/src/api/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/api/index.ts)

Add new interface:
- `AnalysisReviewFinding`

Suggested fields:
- `id`
- `jobId`
- `reportId`
- `scriptId`
- `versionId`
- `canonicalFindingId`
- `sourceKind`
- `primaryArticleId`
- `primaryAtomId`
- `severity`
- `reviewStatus`
- `titleAr`
- `descriptionAr`
- `rationaleAr`
- `evidenceSnippet`
- `pageNumber`
- `startOffsetGlobal`
- `endOffsetGlobal`
- `startOffsetPage`
- `endOffsetPage`
- `anchorStatus`
- `anchorMethod`
- `anchorText`
- `anchorConfidence`
- `manualComment`
- `isManual`
- `approvedReason`
- `reviewedBy`
- `reviewedAt`
- `editedBy`
- `editedAt`

Suggested API methods:
- `findingsApi.getReviewFindingsByJob(jobId)`
- `findingsApi.getReviewFindingsByReport(reportId)`
- `findingsApi.reviewReviewFinding(...)`
- `findingsApi.reclassifyReviewFinding(...)`
- `findingsApi.createManualReviewFinding(...)`

## 6.2 Workspace

File:
- [apps/web/src/pages/ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

Replace:
- mixed `reportFindings` + canonical summary fallback + synthetic cards

With:
- reviewer rows only

Keep:
- manual verification state for unresolved anchors

Remove:
- synthetic reviewer card behavior in normal path

## 6.3 Report Page

File:
- [apps/web/src/pages/Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)

Replace:
- mixed real-findings/canonical-summary rendering branches

With:
- reviewer rows for cards and counts
- `summary_json` only for non-interactive snapshot data

## 6.4 Quick Analysis

File:
- [apps/web/src/pages/QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)

Requirement:
- no quick-specific finding/report semantics after the script is created
- workspace/report pages should work from the same reviewer-row model for quick and client scripts

## 7. Migration Strategy

Phase 2 should be introduced in a non-breaking way.

### Step 1
- create new table(s)
- do not change current readers yet

### Step 2
- aggregation dual-writes:
  - `analysis_reports.summary_json`
  - `analysis_review_findings`

### Step 3
- report page reads reviewer rows first

### Step 4
- workspace reads reviewer rows first

### Step 5
- review/reclassify/manual endpoints update reviewer rows

### Step 6
- reanalysis carry-forward migrates from manual-snapshot-only to reviewer-row-based

### Step 7
- deprecate synthetic fallback logic

## 8. Transitional Compatibility Rules

For old reports/jobs:
- if no reviewer rows exist:
  - legacy report display may remain available
  - workspace should not pretend full interactivity if only summary JSON exists

For new reports/jobs:
- reviewer rows are mandatory before marking job/report as ready for review

## 9. Definition of Ready for Implementation

Implementation can start when:
- the `analysis_review_findings` schema is approved
- aggregation write strategy is approved
- report/workspace agree to read from reviewer rows
- reanalysis carry-forward strategy is approved

## 10. Immediate Next Implementation Move

After this draft is approved:
- create the actual migration for `analysis_review_findings`
- add backend read/write helpers
- add aggregation materialization logic

Only after that should the frontend workspace/report rebuild begin.

