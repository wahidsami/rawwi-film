# Regulator Recommendation Workflow Plan

## Purpose
Add a new regulator workflow that lets a regulator submit a recommendation instead of making the final approval/rejection decision.

This keeps the current final decision authority with Admin and Super Admin, while giving Regulators a structured way to advise the Admin on what they think should happen to a script.

## Why We Need This
Today the workflow is too binary:
- either the regulator can fully approve/reject
- or the regulator is read-only

We want a middle path:
- the regulator reviews the script
- the regulator submits a recommendation
- the admin sees that recommendation clearly
- the admin makes the final decision

This is useful when:
- the Admin wants full control over final decisions
- the regulator should still have an active opinion in the workflow
- the script needs a visible review history that shows who recommended what and why

## Core Rule
The recommendation is **not** the final decision.

Only Admin and Super Admin can still perform the final:
- approve
- reject

The regulator recommendation becomes a workflow status and a review artifact that the Admin can act on.

## Proposed Workflow
1. Beneficiary submits a script.
2. Admin sends the script to a regulator for review.
3. Regulator opens the script in the workspace.
4. Regulator clicks one of:
   - Recommend Approval
   - Recommend Rejection
5. A popup opens and asks for the reason.
6. The regulator submits the recommendation.
7. The script shows a visible recommendation status.
8. Admin sees the recommendation in the sent-scripts list and in the script workspace.
9. Admin reviews the reason and makes the final decision:
   - approve
   - reject
   - send back for review

## Status Model
We should keep the existing final status model and add a recommendation layer on top.

### Final statuses
- `draft`
- `in_review`
- `approved`
- `rejected`
- `under_review`

### Recommendation statuses
- `no_recommendation`
- `recommended_approval`
- `recommended_rejection`

The recommendation status should be visible to Admin, and optionally in regulator views, but it must not replace the final script status.

## How It Should Look In Admin
The Admin should see:
- a badge in the script list showing the current recommendation status
- the regulator name who made the recommendation
- the time the recommendation was submitted
- a short reason preview
- a full recommendation detail panel inside the script workspace

This means the Admin can make a decision with context, not guesswork.

## How It Should Look In Regulator Dashboard
If the regulator does not have `can_accept_reject`:
- they should not see approve/reject buttons
- they should see recommendation actions instead

If the regulator does have `can_accept_reject`:
- we should decide whether to show both:
  - recommendation actions
  - final approve/reject actions
- or only final actions

Recommended product behavior:
- always show recommendation actions
- show final approve/reject only if `can_accept_reject` is enabled

That keeps the workflow flexible and avoids forcing a single decision style on all regulators.

## Popup Behavior
Clicking recommendation should open a modal with:
- title:
  - `Recommend Approval`
  - `Recommend Rejection`
- required textarea:
  - `Why do you recommend this decision?`
- optional supporting note
- submit button
- cancel button

The reason must be required so the Admin gets usable context.

## Data Model Plan
We need to store:
- who recommended
- what they recommended
- when they recommended
- why they recommended it

### Suggested fields
On the script or review record, add:
- `recommendation_status`
- `recommendation_reason`
- `recommended_by`
- `recommended_by_name`
- `recommended_at`

If we want multiple recommendation rounds later, we can normalize this into a history table instead of a single-row field.

### Better long-term option
Add a workflow history table such as:
- `script_workflow_events`

Each event can store:
- script_id
- report_id
- actor_user_id
- actor_role
- event_type
- previous_status
- next_status
- reason
- created_at

That gives us a full audit trail and makes the future journey report much easier.

## Backend Behavior
We will need backend endpoints to:
- save a recommendation
- fetch recommendation status and reason
- include recommendation data in script detail payloads
- include recommendation data in admin lists

The backend should enforce:
- only authorized regulators can submit recommendations
- only Admin/Super Admin can make the final decision
- recommendation reasons must be persisted

## Permission Behavior
This feature is separate from `can_accept_reject`.

Recommended permission split:
- `can_recommend_decision`
  - lets a regulator submit approval/rejection recommendations
- `can_accept_reject`
  - lets a regulator make the final decision if Admin allows it

If we want to minimize change, we can initially make recommendation available to all Regulators and keep final decision behind `can_accept_reject`.

## Recommended Minimal Version
To keep implementation safe, start with this:
- all Regulators can recommend approval or rejection
- only Admin/Super Admin can finalize the script
- recommendation requires a reason
- recommendation is visible in the Admin dashboard and script workspace

This is the lowest-risk version and gives the workflow value immediately.

## UI Changes Needed
### Regulator dashboard
- Add recommendation buttons in script workspace
- Add modal for reason input
- Show recommendation status after submission

### Admin dashboard
- Show recommendation badge in script list
- Show detailed recommendation panel in script workspace
- Show regulator name, time, and reason

### Sent scripts list
- Display current recommendation state
- Allow quick filtering by recommendation status

## Notification Plan
When a regulator submits a recommendation:
- notify Admin in the dashboard
- optionally notify by email

The notification should include:
- script title
- recommendation status
- regulator name
- short reason preview

## Audit Plan
Every recommendation should create an audit entry:
- actor
- action
- timestamp
- script/report id
- reason

This will support future compliance review and the journey report.

## Acceptance Criteria
- Regulator can submit a recommendation from the script workspace
- Recommendation popup requires a reason
- Admin can see recommendation status in the script list
- Admin can see full recommendation details in the script workspace
- Final approval/rejection still belongs to Admin/Super Admin
- Recommendation does not overwrite the final script status
- All recommendation actions are stored and auditable

## Implementation Phases
### Phase 1
- Add data model for recommendation status and reason
- Add backend endpoints for create/read recommendation
- Add UI modal for regulator recommendation

### Phase 2
- Add admin list badges and detail panel
- Add dashboard notifications
- Add audit logging

### Phase 3
- Add recommendation filters
- Add email notification
- Add journey report inclusion

## Recommended Next Step
Implement the minimal version first:
- regulator recommendation action
- required reason popup
- admin visibility in list and detail view
- final decision still with Admin only

That gives us a useful workflow quickly and keeps the risk low.
