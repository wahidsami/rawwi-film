# Script Decision Policy — Verification & Manual Tests

## Current vs desired behavior (aligned)

| Rule | Backend | UI |
|------|---------|-----|
| **Regulator** can approve/reject only scripts **assigned to them** | ✅ `isRegulatorOnly` → require `assignee_id === uid`; else 403 | ✅ `getScriptDecisionCapabilities`: Regulator without assignee → `reasonIfDisabled`, no buttons |
| **Regulator** cannot approve/reject **own** script | ✅ Conflict check blocks creator; Regulator has no override | ✅ Same: creator + Regulator → disabled |
| **Admin** can approve/reject any script **except own** | ✅ `canOverrideOwnScriptDecision` = Super Admin only; Admin creator → 403 | ✅ Only Super Admin gets override in capabilities |
| **Super Admin** can approve/reject **any** script (including own) | ✅ `isSuperAdmin` → override | ✅ `canOverrideOwn` = isSuperAdmin |
| 403 messages | ✅ "Only the assigned reviewer...", "Conflict of interest..." | N/A (backend) |
| **Audit** | ✅ `log_script_status_change` → `script_status_history` + `audit_events` (who, action, before_state, after_state, reason) | N/A |

## Deterministic checks (expected outcomes)

1. **Regulator approving script assigned to them (not creator)**  
   - **Expected:** 200, status → approved.  
   - **UI:** Approve/Reject buttons visible.

2. **Regulator approving script they created (or self-assigned as creator)**  
   - **Expected:** 403 — "Conflict of interest: You cannot approve/reject your own script...".  
   - **UI:** No Approve/Reject buttons; message shown.

3. **Regulator approving script not assigned to them**  
   - **Expected:** 403 — "Only the assigned reviewer can approve or reject this script. This script is not assigned to you."  
   - **UI:** No Approve/Reject buttons; message shown.

4. **Admin approving any script they did not create**  
   - **Expected:** 200.  
   - **UI:** Buttons visible.

5. **Admin approving script they created**  
   - **Expected:** 403 — "Conflict of interest...".  
   - **UI:** No Approve/Reject buttons; message shown.

6. **Super Admin approving any script (including own)**  
   - **Expected:** 200.  
   - **UI:** Buttons visible.

## Audit logging

Decisions are written by `log_script_status_change()` (Edge Function calls it after status update):

- **script_status_history:** `script_id`, `from_status`, `to_status`, `changed_by`, `changed_at`, `reason`, `related_report_id`, `metadata`.
- **audit_events:** `actor_user_id` (who), `action` (script_approved / script_rejected), `before_state` (status, title), `after_state` (status, title, reason, related_report_id), `meta` (history_id).

So: who, what, previous status, new status, and reason are all persisted.

## How to test manually in production

1. **Regulator, assigned script**  
   - Log in as a Regulator. Open a script **assigned to that user**, not created by them.  
   - Confirm Approve/Reject bar is visible. Submit Approve with a reason → 200, script status Approved.  
   - In DB or audit UI, confirm `script_status_history` and `audit_events` have the new row.

2. **Regulator, own script**  
   - As Regulator, open a script **created by that user** (with or without self-assign).  
   - Confirm no Approve/Reject buttons; message: "You cannot approve/reject your own script...".  
   - If you force POST from another client (e.g. curl with same user token), expect 403 and same message.

3. **Regulator, unassigned or assigned to someone else**  
   - As Regulator, open a script **not assigned to you**.  
   - Confirm no Approve/Reject buttons; message: "Only the assigned reviewer... This script is not assigned to you."  
   - Forced POST → 403.

4. **Admin, script created by someone else**  
   - As Admin, open any such script. Buttons visible; Approve/Reject → 200.

5. **Admin, script created by self**  
   - As Admin, open a script you created. No buttons; message about conflict of interest. Forced POST → 403.

6. **Super Admin, own script**  
   - As Super Admin, open a script you created. Buttons visible; Approve/Reject → 200.

## Single source of truth (GET decision/can + POST decision)

- **Shared predicate:** `computeScriptDecisionCan(supabase, uid, script)` in `scripts/index.ts` — used by both GET and POST. Checks: (a) permissions (approve/reject or manage_script_status), (b) conflict-of-interest (creator blocked unless Super Admin), (c) Regulator must be assignee.
- **GET /scripts/:id/decision/can** returns `{ canApprove, canReject, reason? }`. UI (ScriptWorkspace) calls this and hides buttons when false; shows `reason` as hint/tooltip.
- **POST /scripts/:id/decision** uses the same predicate; returns 403 with `reason` when not allowed. Logs `{ scriptId, uid, isCreator, isAssignee, canApprove, canReject }` at info before applying change.
- **Script decision UI exists only in ScriptWorkspace.** The Results page approve/reject is for report/finding review, not script status.

## Smoke tests (minimum)

- **Creator (Regulator) opens own script** → GET decision/can returns canApprove=false, canReject=false, reason set → no buttons.
- **Regulator opens script assigned to them, not creator** → canApprove/canReject true → buttons visible → POST decision succeeds.
- **Admin/Super Admin opens script they did NOT create** → buttons visible → POST succeeds.
- **Admin opens script they created** → canApprove/canReject false (or canReject only if policy allows reject?) — backend blocks; UI must match (no buttons or reason).

## Files changed (summary)

- **Backend:** `supabase/functions/scripts/index.ts` — `computeScriptDecisionCan()` shared; GET `/scripts/:id/decision/can`; POST uses predicate; logging.  
- **Backend:** `supabase/functions/_shared/roleCheck.ts` (`isRegulatorOnly`, `isSuperAdmin`, `canOverrideOwnScriptDecision`).  
- **Frontend:** `apps/web/src/api/index.ts` — `getDecisionCan(id)`.  
- **Frontend:** `apps/web/src/utils/scriptDecisionCapabilities.ts` (fallback when GET fails).  
- **Frontend:** `apps/web/src/components/DecisionBar.tsx` (capabilities prop; tooltip for reasonIfDisabled).  
- **Frontend:** `apps/web/src/pages/ScriptWorkspace.tsx` (fetch GET decision/can, pass to DecisionBar; fallback to client capabilities).  
- **Docs:** `docs/SCRIPT_DECISION_VERIFICATION.md` (this file).
