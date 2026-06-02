# Regulator Send-Back Permission Plan

## Purpose
Add a new regulator action permission that allows an Admin to decide whether a Regulator can send a script back to the beneficiary for revision.

This gives us a controlled middle ground:
- the Regulator can review the script and, if allowed, initiate the revision cycle
- the Admin keeps full control when the permission is disabled
- the revision cycle history remains visible and auditable either way

## Why This Matters
Today the workflow is asymmetrical:
- Regulators can analyze and recommend
- Admins can send scripts back to the beneficiary
- the revision cycle history already exists, but the authority to start that cycle is not configurable per regulator

This new permission lets us decide, per regulator:
- who can trigger the revision cycle
- whose action becomes the `sent_by` actor in the cycle history
- whether the beneficiary is allowed to receive revision requests directly from the regulator or only from Admin

## Proposed Permission
Recommended permission key:

- `can_send_for_review`

Meaning:
- when enabled, the regulator can use the "Send Back for Review" action
- when disabled, the regulator can still analyze and recommend, but only Admin can send the script back to the beneficiary

## Current System Reality
The codebase already has most of the plumbing:
- `send_for_review` is already a valid decision path in `supabase/functions/scripts/index.ts`
- the revision cycle tables already exist:
  - `script_revision_cycles`
  - `script_revision_cycle_events`
  - `script_revision_cycle_snapshots`
  - `script_revision_cycle_comparisons`
- beneficiary resubmission already writes back into the same cycle history
- the Script Workspace already has a cycle history section

So this is not a rebuild. It is a permission gate + UI exposure + audit alignment change.

## Target Behavior

### If `can_send_for_review` is ON
- the Regulator can choose "Send Back for Review"
- the Regulator becomes the actor who initiated the cycle
- the cycle history shows that regulator as the sender
- the beneficiary receives the revision request notification
- the beneficiary resubmission returns to the same script and cycle history
- Admin can still see and override everything

### If `can_send_for_review` is OFF
- the Regulator cannot send the script back
- the Regulator can still review and recommend
- only Admin / Super Admin can trigger the send-back flow
- the cycle history remains intact, but the sender is Admin

## Workflow Rules
1. Beneficiary submits a script.
2. Admin receives it in the main scripts area.
3. Admin assigns the script to a Regulator.
4. Regulator reviews the script.
5. If allowed, Regulator may click "Send Back for Review".
6. The beneficiary receives a revision notification.
7. The beneficiary uploads a revised version.
8. The revised version re-enters the same cycle history.
9. Admin and the assigned Regulator can both see the cycle history.

## Data Model Plan
We should keep the existing revision-cycle schema and add only what is necessary.

### Existing data already used
- `scripts.status`
- `scripts.assignee_id`
- `script_revision_cycles.sent_by`
- `script_revision_cycles.sent_at`
- `script_revision_cycles.returned_at`
- `script_revision_cycles.beneficiary_returned_version_id`
- `script_revision_cycles.reanalyzed_at`
- `script_revision_cycle_events`

### New user permission storage
The permission should live in the same user permission metadata model already used for:
- `can_accept_reject`
- section access
- role metadata

### Optional future enhancement
If we later need a richer workflow audit, we can normalize the action into a dedicated workflow event table. For now, the existing revision-cycle tables are enough.

## Backend Changes Required

### 1) Permission evaluation
Add a new helper similar to the existing decision gating:
- `canSendForReview`

That helper should answer:
- can this user send this script back for review?
- if not, why not?

Expected checks:
- user must be authenticated
- user must be a Regulator or Admin-level actor allowed by policy
- script must not already be in a final terminal state
- if user is Regulator, the script should be assigned to them
- permission flag must be enabled when the actor is a Regulator

### 2) Decision endpoint enforcement
The `send_for_review` branch in `supabase/functions/scripts/index.ts` should enforce the new permission.

Behavior:
- if user is Admin/Super Admin, keep current behavior
- if user is Regulator, require `can_send_for_review`
- if missing, return `403`

### 3) Cycle ownership
When the Regulator sends the script back:
- `script_revision_cycles.sent_by` should store that regulator's user id
- `script_revision_cycle_events.actor_user_id` should store that regulator's user id
- notifications to the beneficiary should say the script came back from review

### 4) Notification routing
Keep current beneficiary notification behavior, but update the actor labels so the beneficiary can understand who initiated the revision.

## Frontend Changes Required

### 1) Access Control UI
Add a new checkbox for Regulator accounts:
- label: `Can send back for review`
- key: `can_send_for_review`
- default: off for new Regulators

### 2) Script Workspace action bar
The "Send Back for Review" action should:
- be visible only when the user has the permission
- open the existing decision modal
- require a reason and optional beneficiary-facing note

### 3) Decision capabilities helper
Update the decision helper so the UI knows when to show:
- approve
- reject
- send back for review

### 4) Cycle history display
Update labels so the workflow reads naturally:
- `Sent for review`
- `Returned by beneficiary`
- `Reanalyzed`
- `Closed`

### 5) Regulator dashboard
If the regulator has send-back permission, show the action in the workspace.
If not, hide it completely.

## Admin Experience
Admin should be able to see:
- whether the Regulator has the send-back permission
- who initiated the revision cycle
- the cycle timeline
- the beneficiary's resubmitted version
- the reanalysis linked to the cycle

Admin should also retain the ability to:
- send back for review even if the regulator does not have this permission
- approve or reject at the end of the cycle

## Beneficiary Experience
Beneficiary should see:
- a clear revision request notification
- the reason for the send-back
- any optional beneficiary-facing comment
- the current cycle number

Beneficiary should continue to upload the revised version in the same place they already use.

## Audit Requirements
Every send-back action should create an audit trail item with:
- actor id
- actor role
- script id
- cycle id
- timestamp
- reason
- optional beneficiary comment

This is important for:
- compliance review
- journey reports
- dispute resolution
- internal accountability

## Recommended Implementation Order

### Phase 0 - Decision
- confirm the exact permission key name
- confirm whether Regulator-only or Admin-managed roles can receive it

### Phase 1 - Data and backend enforcement
- add permission support to user metadata handling
- add backend helper for `can_send_for_review`
- enforce the new permission in `send_for_review`

### Phase 2 - Admin UI
- add the checkbox in Access Control
- show it in edit user dialogs
- ensure it defaults to off for new Regulators

### Phase 3 - Workspace UI
- gate the send-back action in the script workspace
- make the action modal show only when allowed
- align labels and hints with the new workflow

### Phase 4 - Cycle history and notifications
- ensure regulator-initiated send-back is reflected in cycle history
- update beneficiary notification wording
- verify the admin can clearly see who initiated the cycle

### Phase 5 - QA and regression
- test Admin-only send-back
- test Regulator with permission
- test Regulator without permission
- confirm beneficiary resubmission still lands in the same cycle history

## Acceptance Criteria
- Admin can grant or withhold `can_send_for_review` per regulator
- Regulator without permission cannot send back for review
- Regulator with permission can send back for review
- Cycle history shows the correct sender
- Beneficiary resubmission remains linked to the same cycle
- Admin still sees everything and retains final control
- No existing approval/rejection behavior regresses

## Progress Tracker

- [ ] Confirm permission key name
- [ ] Add backend permission helper
- [ ] Enforce permission in `send_for_review`
- [ ] Add Access Control checkbox
- [ ] Gate the workspace button
- [ ] Update cycle history labels
- [ ] Test beneficiary resubmission
- [ ] Redeploy frontend
- [ ] Redeploy scripts edge function
- [ ] Verify admin-only vs regulator-owned flow

## Notes
This permission is intentionally separate from:
- `can_accept_reject`
- recommendation permissions

That keeps the workflow predictable:
- `can_accept_reject` = final decision power
- `can_send_for_review` = send-back authority
- recommendation permission = advisory opinion

