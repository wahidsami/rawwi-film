# Script Journey Report Master Spec

Date: 2026-05-17  
Owner: Admin Dashboard / Reports  
Status: Phase 1 implemented (JSON endpoint), PDF phase pending

## Goal
Generate a high-detail lifecycle report for a script after final decision (approved/rejected), covering:
1. Submission and beneficiary snapshot
2. Revision cycles and back-and-forth timeline
3. Findings evolution across cycles
4. Admin accountability and ownership
5. End-to-end turnaround duration

## Endpoint (Phase 1)
`GET /reports/script-journey?scriptId=<uuid>`

Response shape:
1. `script`: core script info + metadata snapshot
2. `beneficiary`: beneficiary identity/type
3. `decision`: final decision and decision actor/date
4. `summary`: aggregate metrics (days, cycles, findings trend)
5. `timeline`: chronological lifecycle events
6. `cycles`: detailed per-cycle cards
7. `adminActivity`: action list grouped by actors
8. `findingsEvolution`: cycle-by-cycle resolved/persisting/new stats
9. `complianceSnapshot`: final checklist from latest report

## Data Sources
1. `scripts`
2. `clients`
3. `analysis_jobs`
4. `analysis_reports`
5. `analysis_findings`
6. `script_revision_cycles`
7. `script_revision_cycle_events`
8. `script_revision_cycle_snapshots`
9. `script_revision_cycle_comparisons`
10. `script_status_history`
11. `profiles`

## Access Control
1. Admin/Super Admin: full access
2. Non-admin: only if owner/assignee of script

## Phase 2 (Next)
1. Render PDF from endpoint DTO
2. Branded cover + executive cards
3. Timeline and cycle visual layout
4. Download/store file support

