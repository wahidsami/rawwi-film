# Raawi Film: Revision-Cycle Workflow + Draft Reliability Master Plan (HOLD)

## Status
- State: `ON HOLD` (implementation paused by product direction)
- Prepared on: `2026-05-14`
- Owner: Product + Engineering
- Last update: `2026-05-14` (draft module rebuild delivered in beneficiary dashboard)
- Priority:
  1. Fix beneficiary draft flow blocker (`scripts_expected_rank_check`)
  2. Stabilize My Scripts "View" behavior for beneficiary
  3. Implement full admin `Send for Review` multi-cycle workflow

---

## 1) Immediate Production Issue (Must Fix First)

### 1.1 Reported Issue
When beneficiary adds a script, uploads files, and clicks `Save as Draft`, submission behavior is inconsistent and may act like submit.  
Current error observed:
- `new row for relation "scripts" violates check constraint "scripts_expected_rank_check"`
- API endpoint: `POST /functions/v1/scripts`

### 1.2 Expected Product Behavior
- `Save as Draft`:
  - Saves script + uploaded files as draft only
  - Keeps item in beneficiary dashboard (`نصوصي`) as draft
  - Does **not** enter admin review queues
  - Does **not** trigger submit flow
- `Submit`:
  - Moves script to review flow
  - Appears to admin as a submitted request

### 1.3 Likely Root Cause
- DB constraint `scripts_expected_rank_check` still expects values that do not match current UI behavior after expected-rank hiding/change.
- Draft insert/update likely passes `NULL`/`''`/unexpected value and fails constraint.

### 1.4 Required Technical Resolution
1. Align DB constraint with current product contract:
   - Either allow `NULL` for `expected_rank`
   - Or constrain only to current allowed set when present
2. Ensure `Save as Draft` backend path is explicitly draft-only and never routes to submit branch.
3. Ensure uploaded files persist in draft state and are re-openable/editable later.

### 1.5 Verification Checklist (for this bug)
- Draft save works with and without optional fields.
- Draft remains visible only to beneficiary in My Scripts.
- Draft does not appear under admin submitted lists.
- Re-open draft loads all fields/files correctly.
- Submit still works and transitions to review.

---

## 2) Beneficiary "View" Page Requirement (Foundational Before Full Cycle UX)

### 2.1 Current Gap
`View` action in My Scripts is status-dependent and not a stable details page.

### 2.2 Required Behavior
`View` should always route to one consistent script details page and include:
- Script metadata (title, type, classification, created/updated timestamps)
- Current normalized status
- Uploaded files (script file, summary pdf, security attachment if any)
- Cycle/timeline events (once revision workflow is enabled)
- Rejection reason/report block (if rejected)
- Certificate block (if approved & available)

### 2.3 Route Proposal
- `GET /client/scripts/:scriptId` (frontend route + backend data endpoint)

---

## 3) New Critical Feature: Admin 3-Decision Workflow

### 3.1 Product Requirement
In analysis report page, admin must have three actions:
1. `Approve`
2. `Send for Review`
3. `Reject`

`Send for Review` may happen multiple times for the same script.

### 3.2 Business Goal
Allow beneficiary to receive report, fix script, resubmit revised version, and allow admin to reanalyze with full historical trace and comparison across cycles.

---

## 4) Revision-Cycle Domain Model (Core Architecture)

### 4.1 Core Entities
1. `script_revision_cycles`
   - Tracks each admin send-back round
2. `script_revision_cycle_events`
   - Timeline of actions within each cycle
3. `script_revision_cycle_snapshots`
   - Frozen findings/report summary at send time
4. `script_revision_cycle_comparisons`
   - Diff results between cycles/reports

### 4.2 Suggested Tables (Schema-level)

#### `script_revision_cycles`
- `id uuid pk`
- `script_id uuid not null`
- `cycle_number int not null`
- `source_report_id uuid null` (report sent to beneficiary)
- `source_job_id uuid null`
- `sent_by uuid not null`
- `sent_at timestamptz not null`
- `beneficiary_returned_version_id uuid null`
- `returned_at timestamptz null`
- `reanalyzed_job_id uuid null`
- `reanalyzed_report_id uuid null`
- `reanalyzed_at timestamptz null`
- `status text` check in (`sent`,`returned`,`reanalyzed`,`closed`)
- `admin_note text null`
- unique: (`script_id`,`cycle_number`)

#### `script_revision_cycle_events`
- `id uuid pk`
- `cycle_id uuid not null`
- `script_id uuid not null`
- `event_type text` check in:
  - `sent_for_review`
  - `beneficiary_resubmitted`
  - `admin_reanalysis_started`
  - `admin_reanalysis_completed`
  - `approved`
  - `rejected`
- `actor_user_id uuid null`
- `payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

#### `script_revision_cycle_snapshots`
- `id uuid pk`
- `cycle_id uuid not null`
- `script_id uuid not null`
- `report_id uuid not null`
- `job_id uuid not null`
- `findings_total int not null`
- `findings_approved int not null default 0`
- `findings_violation int not null default 0`
- `severity_counts jsonb not null default '{}'`
- `type_counts jsonb not null default '{}'`
- `snapshot_payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

#### `script_revision_cycle_comparisons`
- `id uuid pk`
- `cycle_id uuid not null`
- `script_id uuid not null`
- `old_report_id uuid not null`
- `new_report_id uuid not null`
- `comparison_summary jsonb not null default '{}'`
- `comparison_payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

---

## 5) Finding Comparison Strategy (Including Manual Findings)

### 5.1 Matching Priority
1. `canonical_finding_id` exact match
2. Policy coordinates: `article/atom` + normalized snippet similarity
3. Anchor proximity (page/offset tolerance)
4. Manual fallback: semantic + lexical similarity with threshold

### 5.2 Outcome Buckets
- `resolved` (old existed, now absent)
- `persistent` (old still present)
- `new` (newly introduced)
- `manual_unmatched` (needs reviewer mapping)

### 5.3 Manual Finding Handling
Manual findings from prior cycle are included in snapshot and compared using same matching pipeline; unmatched manual items explicitly shown in cycle report.

---

## 6) State Machine (Script-Level)

### 6.1 Internal States (system)
- `draft`
- `in_review`
- `analysis_running`
- `review_required`
- `revision_requested` (new)
- `resubmitted` (new)
- `approved`
- `rejected`

### 6.2 Beneficiary Display States (normalized)
- `draft`
- `in_review` (covers in_review/analysis_running/review_required/revision_requested/resubmitted)
- `approved` (`مفسوح`)
- `rejected`

---

## 7) API/Function Changes

### 7.1 Scripts/Reports
- add action: `send_for_review`
- create cycle row + events + snapshot
- generate/download Word report for beneficiary

### 7.2 Beneficiary Resubmission
- endpoint to upload revised script against active cycle
- enforce one active cycle at a time per script

### 7.3 Comparison Service
- run after reanalysis completion
- persist cycle comparison summary/payload

### 7.4 Notification/Email
- on `send_for_review`: dashboard notification + email with instructions
- on beneficiary resubmit: admin notification

---

## 8) UI Changes by Surface

### 8.1 Admin Report Page
- replace 2-action decision bar with:
  - `Approve`
  - `Send for Review`
  - `Reject`
- modal for send-for-review with optional note

### 8.2 Admin Script Workspace
- cycle history panel:
  - sent at
  - returned at
  - findings old/new
  - compare button

### 8.3 Beneficiary My Scripts
- stable `View` page route
- cycle timeline + latest report + resubmit entrypoint

### 8.4 Beneficiary Script Details Page
- show latest admin feedback package
- show active cycle status
- upload revised script (docx) + submit back

---

## 9) Reporting Outputs

### 9.1 Final Script History Report (separate)
Contains:
- cycle count
- per-cycle findings totals
- resolved/persistent/new trends
- manual findings treatment summary
- actor/time trace

### 9.2 Export Formats
- PDF + optional Word summary

---

## 10) Security and Permissions
- only admin roles can trigger `send_for_review`, `approve`, `reject`
- only owning beneficiary account can upload resubmission
- full audit events for each cycle action

---

## 11) Rollout Plan (Phased)

### Phase A (Hotfix/Stabilization)
1. Fix `expected_rank` constraint + draft save semantics
2. Implement stable beneficiary script `View` page
3. QA for draft/submit split

### Phase B (Cycle Foundation)
1. Add cycle tables + migrations
2. Add send-for-review backend action
3. Add beneficiary resubmission backend

### Phase C (Comparison Intelligence)
1. Snapshot freezing and comparison engine
2. Manual finding reconciliation logic
3. Persist and expose diff summaries

### Phase D (Experience)
1. Admin history UI
2. Beneficiary cycle timeline UI
3. Final script history report export

### Phase E (Hardening)
1. edge-case QA
2. performance profiling on large scripts
3. monitoring + rollback guards

---

## 12) Test Matrix (Must Pass)
- draft save does not submit
- submit transitions correctly
- send-for-review creates cycle and sends report
- beneficiary resubmits new version in same script thread
- admin reanalysis links to cycle
- comparison outputs resolved/persistent/new correctly
- manual findings are tracked across cycles

---

## 13) Current Hold Scope
Implementation is intentionally paused after planning.  
Next execution starts from **Phase A / item #1** (`scripts_expected_rank_check` + draft behavior).

---

## 14) Progress Applied (Implemented Against This Plan)

### 14.1 Phase A Status (Current)
1. `expected_rank` alignment:
   - Implemented via migration:
     - `supabase/migrations/20260514052000_scripts_expected_rank_alignment.sql`
   - Constraint now supports hidden/optional expected-rank behavior in beneficiary flow.

2. Draft flow stabilization:
   - Implemented in beneficiary dashboard module (`ClientPortal`):
     - Add Script is currently **draft-only** in this phase.
     - `Save Draft` no longer routes to submit/admin flow.
     - Draft files are preserved and can be reopened.

3. Stable beneficiary View behavior:
   - Added a distinct beneficiary script view surface (`script-view`) separate from edit.
   - `View` and `Edit` are split in behavior:
     - `View`: read-only details + attachments
     - `Edit`: editable form for draft updates

### 14.2 Delivery Scope Clarification (Current Build)
- This phase intentionally does **not** include submit-to-admin buttons on Add Script.
- Admin review actions and cycle actions remain in upcoming phases (B/C/D).

### 14.3 Immediate Next UI Work (Same Plan, No New Doc)
To connect current draft module to revision cycles:
1. Extend beneficiary `script-view` page with a **Revision Cycles panel**.
2. Show for beneficiary:
   - latest admin feedback package (Word/PDF)
   - cycle status (sent/returned/reanalyzed/closed)
   - timeline events
3. Add beneficiary action in `script-view`:
   - upload revised DOCX for active cycle
   - submit revision back to admin

### 14.4 Where Beneficiary Will Work in Final Flow
- Beneficiary works in:
  - `نصوصي` list
  - per-script `View` page (`script-view`) as the primary revision workspace
- Beneficiary does **not** work inside admin analysis workspace.
