# Script Decision Policy — Current vs Desired & Changes

## Short report: current vs desired behavior

**Desired (now implemented):**

- **Regulator:** Can approve/reject **only** scripts **assigned to them**. Cannot approve/reject scripts they created (conflict of interest).
- **Admin:** Can approve/reject any script **except** their own. No override for own script.
- **Super Admin:** Can approve/reject **any** script, including their own (override).
- When backend would reject, return **403** with a clear message. UI shows decision buttons **only when** backend would allow (single capability object: `canApprove`, `canReject`, `reasonIfDisabled`).

**Previously (before this pass):**

- Backend: Creator could not decide unless Admin **or** Super Admin (both had override). No assignee rule for Regulator.
- UI: Decision bar could show for creator (Admin) and then 403 on submit; no assignee gating for Regulator.

**Now:**

- Backend: Regulator must be assignee; only **Super Admin** can override (decide on own script). Admin creator gets 403.
- UI: `getScriptDecisionCapabilities()` mirrors backend; DecisionBar receives `capabilities` and shows buttons only when allowed, else shows `reasonIfDisabled`.

### Truth table (who can approve/reject)

| Creator | Assignee | Regulator can? | Admin can? | Super Admin can? |
|---------|----------|----------------|------------|-------------------|
| User A  | —        | No (not assigned) | Yes     | Yes               |
| User A  | User B   | Only if B = current user | Yes | Yes            |
| User A  | User A   | No (creator)   | No (creator) | Yes (override) |
| Admin   | User B   | Only if B = current user | Yes | Yes            |
| Admin   | Admin    | No (not assignee unless Regulator is Admin) | No (creator) | Yes   |
| Super Admin | —    | No (not assigned) | Yes     | Yes               |

---

## Exact files changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/roleCheck.ts` | Added `isRegulatorOnly()`, `isSuperAdmin()`. `canOverrideOwnScriptDecision()` now returns only `isSuperAdmin()` (no longer Admin). |
| `supabase/functions/scripts/index.ts` | After permission check: if `isRegulatorOnly(uid)` then require `script.assignee_id === uid` else 403. Conflict unchanged but override is Super Admin only. |
| `apps/web/src/utils/scriptDecisionCapabilities.ts` | **New.** `getScriptDecisionCapabilities(script, user, hasPermission)` → `{ canApprove, canReject, reasonIfDisabled }`. |
| `apps/web/src/components/DecisionBar.tsx` | Optional prop `capabilities`; when set, use it for canApprove/canReject; when both false show `reasonIfDisabled`. |
| `apps/web/src/pages/ScriptWorkspace.tsx` | Compute capabilities via `getScriptDecisionCapabilities(script, user, hasPermission)` and pass to `DecisionBar`. |
| `docs/SCRIPT_DECISION_POLICY.md` | Updated override to Super Admin only; Regulator assignee rule; verification list. |
| `docs/SCRIPT_DECISION_VERIFICATION.md` | **New.** Deterministic checks, audit logging, manual test steps. |
| `docs/SCRIPT_DECISION_REPORT.md` | **New.** This report. |

---

## How to test manually in production

1. **Regulator + assigned script (not creator):** Log in as Regulator, open script assigned to you, not created by you → Approve/Reject visible → submit → 200. Check `script_status_history` and `audit_events` for who, action, before/after status, reason.
2. **Regulator + own script:** As Regulator, open script you created → no buttons, message "You cannot approve/reject your own script...". Forced POST → 403.
3. **Regulator + script not assigned to them:** As Regulator, open script assigned to someone else or unassigned → no buttons, message "Only the assigned reviewer...". Forced POST → 403.
4. **Admin + script not created by them:** As Admin, open any such script → buttons visible → 200.
5. **Admin + script created by self:** As Admin, open own script → no buttons; POST → 403.
6. **Super Admin + own script:** As Super Admin, open own script → buttons visible → 200.

See **docs/SCRIPT_DECISION_VERIFICATION.md** for full steps and audit details.
