# Regulator Performance Report Spec

## Purpose
This report helps an Admin understand how a Regulator is performing over time.

It is not just a list of actions. It should answer:
- How many scripts did the regulator handle?
- How fast did they respond?
- How often did they recommend approval or rejection?
- How often did they send scripts back for review?
- How often did the admin follow their recommendation?
- How consistent and active was the regulator during the review cycles?

The report should be generated for a selected time range and focused on one regulator at a time.

---

## Report Audience
- Admin
- Super Admin

The report should not be visible to general regulators unless the product later adds a self-view version.

---

## Report Inputs
Minimum required inputs:
- Regulator user id
- Date range
- Optional filter by script status
- Optional filter by beneficiary

Recommended default range:
- Last 30 days

---

## Executive Summary
The top of the report should give a quick scorecard with:
- Regulator name
- Email
- Role
- Date range
- Total scripts assigned
- Total scripts opened
- Total recommendation actions
- Total send-back actions
- Average time to first action
- Average turnaround time
- Recommendation agreement rate
- Final approval rate

This section should be readable in 10 seconds.

---

## Core Metrics

### 1. Volume
What it measures:
- How much work the regulator handled.

Metrics:
- Assigned scripts
- Opened scripts
- Reviewed scripts
- Reports analyzed
- Revision cycles touched
- Recommendations submitted

### 2. Speed
What it measures:
- How quickly the regulator responds.

Metrics:
- Time from assignment to first view
- Time from assignment to first action
- Time from assignment to recommendation
- Time from assignment to send-back
- Time from assignment to final closure

### 3. Decision Behavior
What it measures:
- How the regulator tends to judge scripts.

Metrics:
- Recommended approval count
- Recommended rejection count
- Send-back count
- Final decision count
- Share of actions per type

### 4. Outcome Alignment
What it measures:
- Whether the admin usually agrees with the regulator’s recommendation.

Metrics:
- Recommendations that matched final admin decision
- Recommendations that were overridden
- Send-back actions that led to revision and resubmission

### 5. Cycle Handling
What it measures:
- How the regulator behaves across revision cycles.

Metrics:
- Cycles reviewed
- Cycles returned to beneficiary
- Cycles reopened after beneficiary resubmission
- Findings count before and after revision
- Findings reduced / unchanged / increased

### 6. Audit and Accountability
What it measures:
- Whether the regulator is active and traceable.

Metrics:
- Last activity date
- Last recommendation date
- Last send-back date
- Notifications triggered
- Audit events recorded

---

## Report Sections

### Cover
Should include:
- Report title
- Regulator name
- Role
- Date range
- Generated at timestamp
- Report id

### Executive Summary Cards
Should include:
- Assigned scripts
- Opened scripts
- Recommendations
- Send-backs
- Avg first action time
- Agreement rate

### Activity Timeline
Chronological events such as:
- Script assigned
- Script opened
- Recommendation submitted
- Send back issued
- Beneficiary resubmitted
- Final admin decision

Each event should show:
- Date and time
- Action
- Script title
- Beneficiary
- Related cycle if applicable

### Script-by-Script Breakdown
For each script handled by the regulator:
- Script title
- Beneficiary name
- Assigned date
- First opened date
- Recommendation type
- Recommendation reason preview
- Send-back count
- Current status
- Final decision
- Time spent overall

### Cycle Breakdown
For each revision cycle:
- Cycle number
- Start date
- Send-back date
- Beneficiary return date
- Reanalysis date
- Findings before and after
- Cycle outcome
- Actor who sent it back

### Decision Alignment
For each script or cycle:
- Regulator recommendation
- Admin final decision
- Match / mismatch
- Notes

### Notes and Comments
Should display:
- Regulator internal reason
- Admin notes if any
- Beneficiary comments if any
- Shared reports attached during send-back

---

## Data Sources

### Existing and usable now
- `scripts`
  - assignment, status, created_at, created_by, assignee_id
- `script_recommendation_events`
  - recommendation type, reason, recommended_by, created_at
- `script_revision_cycles`
  - sent_by, sent_at, returned_at, reanalyzed_at, status, admin_note
- `script_revision_cycle_events`
  - who triggered the cycle action and when
- `script_revision_cycle_snapshots`
  - findings totals and severity distribution at cycle start
- `script_revision_cycle_comparisons`
  - delta and comparison summaries
- `analysis_reports`
  - findings counts, review status, timestamps
- `notifications`
  - assignment and workflow notifications
- `audit_events`
  - system-wide audit trail

### Helpful but optional future fields
- first_opened_at on scripts or audit events
- time_spent_in_review
- decision_rationale_category
- regulator_workload_score
- admin_followed_recommendation flag
- reviewer_confidence field

---

## Suggested Scoring Model
This should be optional and explained clearly in the UI.

Possible dimensions:
- Speed score
- Volume score
- Agreement score
- Revision effectiveness score
- Consistency score

Example:
- High speed, high agreement, and good cycle reduction = strong performance
- High activity but low agreement = mixed performance
- Many send-backs with little progress = needs review

Important:
- The score should be transparent
- The report must show the raw data used to compute it
- The score must not hide the underlying metrics

---

## Visual Design Direction
The PDF should feel like an executive report, not an export dump.

Recommended layout:
- Strong cover page
- Summary cards at the top
- Timeline in a vertical flow
- Script table with compact analytics
- Cycle cards with before/after stats
- Final assessment box at the end

Styling recommendations:
- Clean typography
- Clear Arabic RTL support
- Color-coded status chips
- Charts kept simple and readable
- Print-friendly spacing

---

## Permissions
Only these users should generate or view this report by default:
- Admin
- Super Admin

Later, we may optionally allow:
- a regulator self-view version
- a manager-only summary view

---

## Backend Requirements
To build this report reliably, we need an endpoint that can:
- load a regulator
- load scripts assigned to that regulator
- join recommendations, cycles, reports, notifications, and audit trail
- compute summary metrics
- return a normalized DTO for PDF generation

Suggested endpoint:
- `GET /reports/regulator-performance?userId=...&from=...&to=...`

Suggested output:
- JSON summary
- timeline entries
- script rows
- cycle rows
- score breakdown

---

## Frontend Requirements
Add a button in Admin report or user detail pages:
- `Regulator Performance Report`

The UI should allow:
- choosing regulator
- selecting date range
- previewing summary metrics
- downloading PDF

---

## Acceptance Criteria
The report is complete when:
- it shows the regulator’s handled scripts
- it shows recommendation behavior
- it shows send-back behavior
- it shows cycle history involvement
- it shows turnaround time
- it shows outcome alignment against admin decisions
- it is printable and readable in Arabic and English

---

## Implementation Phases

### Phase 1
- Build the report data contract
- Create the backend endpoint
- Return JSON preview

### Phase 2
- Build the PDF template
- Add summary cards and timeline
- Add script and cycle tables

### Phase 3
- Add charts and scoring
- Add admin-facing filters
- Add polish for RTL and print layout

### Phase 4
- Validate with a high-activity regulator
- Validate with a low-activity regulator
- Validate with send-back-heavy cases
- Validate with recommendation-only cases

---

## Notes on Data Gaps
We already have enough data to launch a useful first version.

The main limitation is that we do not yet have perfect “thinking quality” metrics, such as:
- time spent reading before acting
- confidence/uncertainty of judgment
- explicit rationale categories

Those can be added later if we want a more advanced analytics report.

