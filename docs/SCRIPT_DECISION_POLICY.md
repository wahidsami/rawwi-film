# Script Accept / Reject (Decision) Policy

This document explains the full **approve/reject (decision)** policy for scripts: who can decide, when, and why. It also describes the current implementation, why "Conflict of interest" appears, and the recommended final policy.

---

## TASK A — Implementation locations

### Edge Function: decision endpoint

| What | Location |
|------|----------|
| **Route** | `POST /scripts/:id/decision` |
| **Handler** | `supabase/functions/scripts/index.ts` — decision block starting at line **411** (regex match `rest.match(/^([^/]+)\/decision$/)` at line 412). |
| **Body** | `{ decision: 'approve' | 'reject', reason: string, relatedReportId?: string }` |
| **Permission check** | Lines **448–461**: RPC `user_can_approve_scripts(p_user_id)` or `user_can_reject_scripts(p_user_id)` — user must have `approve_scripts` or `manage_script_status` / `reject_scripts` or `manage_script_status`. |
| **Conflict-of-interest check** | Lines **464–467**: `if ((script as any).created_by === uid) return json({ error: "Conflict of interest: You cannot approve/reject your own script" }, 403);` — uses **`script.created_by`** and **`uid`** (current user). **Does not use `assignee_id`** for this check. |
| **Script fetch** | Lines **436–441**: `scripts` table, columns `id, title, status, created_by, assignee_id`. |

### Permission SQL (who can approve/reject)

| What | Location |
|------|----------|
| **Permissions** | `approve_scripts`, `reject_scripts`, `manage_script_status` — defined in `supabase/migrations/20260214065500_approval_permissions.sql`. |
| **Role assignment** | Same migration: **Regulator** gets `approve_scripts` and `reject_scripts`; **Admin** (or Super Admin, one role ID used) gets all three. |
| **RPCs** | `user_can_approve_scripts(p_user_id UUID)` and `user_can_reject_scripts(p_user_id UUID)` in `supabase/migrations/20260214070000_enhanced_audit_events.sql` (lines 102–151). They check `user_roles` → `role_permissions` → `permissions` for the given user. |

### Database-level (scripts table)

| What | Location |
|------|----------|
| **RLS on `scripts`** | `supabase/migrations/20260214051500_enable_rls_ownership.sql`: SELECT for owner or assignee or admin; UPDATE for owner or assignee; INSERT for owner; DELETE for owner. Admins have FOR ALL via `is_admin_user()`. |
| **Script status logging** | `log_script_status_change()` (20260214070000) writes to `script_status_history` and `audit_events`. The Edge Function calls it after updating script status (scripts/index.ts lines 481–489). |
| **No RLS on decision itself** | The decision is enforced only in the Edge Function (permission + conflict check). The status update uses the **admin** Supabase client, so RLS is bypassed; the function must enforce rules. |

### Frontend

| What | Location |
|------|----------|
| **Decision bar** | `apps/web/src/components/DecisionBar.tsx` — shows Approve/Reject if user has `approve_scripts` or `manage_script_status` / `reject_scripts` (lines 36–41). **Does not** check creator vs assignee; anyone with permission sees the buttons. |
| **API call** | `apps/web/src/api/index.ts`: `scriptsApi.makeDecision(id, decision, reason, relatedReportId)` → `POST /scripts/:id/decision`. |
| **Where shown** | `apps/web/src/pages/ScriptWorkspace.tsx` (lines 1406–1419): DecisionBar is always rendered when `script` exists; no creator/assignee gating. |

---

## TASK B — Truth table (who can accept/reject)

Legend:

- **Can decide** = has permission (approve_scripts/reject_scripts or manage_script_status) **and** is not blocked by conflict-of-interest.
- **Conflict rule (current)** = backend blocks when `script.created_by === uid` (creator cannot decide).

| Case | Script creator | Assignee | Creator can decide? | Assignee can decide? | Admin can decide? | Super Admin can decide? | Regulator can decide? |
|------|-----------------|----------|----------------------|------------------------|-------------------|---------------------------|------------------------|
| 1. Created by regular user, unassigned | User A | — | **No** (creator) | — | Yes | Yes | Yes (if has permission) |
| 2. Created by regular user, assigned to other | User A | User B | **No** (creator) | **Yes** (if B has permission) | Yes | Yes | Yes |
| 3. Created by regular user, assigned to self | User A | User A | **No** (creator) | **No** (same person = creator) | Yes | Yes | Yes |
| 4. Created by Admin, assigned to other | Admin | User B | **No** (creator) | **Yes** (if B has permission) | Yes | Yes | Yes |
| 5. Created by Admin, assigned to Admin | Admin | Admin | **No** (creator) | **No** (creator) | **Yes** (admin can decide on any script they didn’t create; here they did create it → **blocked**) | **Blocked** (same) | Yes |
| 6. Created by Admin, unassigned | Admin | — | **No** (creator) | — | **No** (creator = admin, blocked) | **No** (blocked) | Yes |

**Current backend rule (single check):** `created_by === uid` → 403. So **creator never** approve/reject, including when creator is Admin/Super Admin. There is **no** “assignee may decide” requirement in code; only “creator may not.”

**Multiple decisions:** One status transition per script (approved or rejected). No “override” flow; the first successful decision wins. Admin/Super Admin are not currently allowed to override **their own** script because the conflict check does not distinguish by role.

---

## TASK C — Why you got blocked

- **Error:** `POST /functions/v1/scripts/:id/decision` → **403** — “Conflict of interest: You cannot approve/reject your own script.”
- **Trigger:** The handler compares **`script.created_by`** with **`uid`** (current user). If they are equal, it returns 403.
- **Your situation:** You said `current user.id == assigneeId` and `isAssigning = false`. So you are the **assignee**. If you are **also** the **creator** (`script.created_by === user.id`), then the backend blocks you regardless of being assignee. So:
  - **Exact check:** `supabase/functions/scripts/index.ts` lines **465–467**  
    `if ((script as any).created_by === uid) return json({ error: "Conflict of interest: You cannot approve/reject your own script" }, 403);`
  - **Data used:** `script.created_by` (from DB), `uid` (from `auth.userId`). **`assignee_id` is not used** in this check.

So: **any** user who **created** the script is blocked from making the approve/reject decision, including when they assigned the script to themselves.

---

## TASK D — Recommended final policy

**Option A (recommended): Assignee decides; Admin/Super Admin can override; Creator cannot decide unless they are Admin/Super Admin.**

- **Creator (regular user):** Cannot approve/reject their own script (conflict of interest).
- **Assignee (not creator):** Can decide if they have `approve_scripts` / `reject_scripts` (or `manage_script_status`).
- **Admin:** Can approve/reject any script **except** their own (no override).
- **Super Admin:** Can approve/reject **any** script, including their own (override).
- **Regulator:** Can approve/reject **only** scripts **assigned to them**; cannot decide on their own script (no override).

This keeps conflict-of-interest for non-admins, allows assignee-based workflow, and unblocks the case “Admin created and self-assigned.”

**Tradeoffs:**

- **Option B (only Regulator decides):** Clear separation but requires a Regulator for every script; less flexible.
- **Option C (creator never, assignee decides, admin override):** Same as A; we’re adopting A with an explicit admin override.

**Concrete rule (implemented):**

1. User must pass permission check (existing RPC).
2. **Regulator:** Can decide only if `script.assignee_id === uid`; else 403.
3. **Conflict of interest:** If `script.created_by === uid`, allow decision **only if** the user is Super Admin (override). Admin and Regulator cannot decide on own script.

---

## TASK E — Implemented changes

### 1. Edge Function: Regulator assignee + Super Admin–only override

**File:** `supabase/functions/scripts/index.ts`

- Import `canOverrideOwnScriptDecision`, `isRegulatorOnly` from `../_shared/roleCheck.ts`.
- **Regulator:** If `isRegulatorOnly(supabase, uid)` then require `script.assignee_id === uid`; else 403: "Only the assigned reviewer can approve or reject this script. This script is not assigned to you."
- **Conflict:** If `script.created_by === uid`, allow only if `canOverrideOwnScriptDecision(supabase, uid)` (Super Admin only). Else 403 with conflict message.

### 2. UI: capabilities object and DecisionBar

**Files:** `apps/web/src/utils/scriptDecisionCapabilities.ts`, `DecisionBar.tsx`, `ScriptWorkspace.tsx`

- **scriptDecisionCapabilities.ts:** `getScriptDecisionCapabilities(script, user, hasPermission)` returns `{ canApprove, canReject, reasonIfDisabled }` aligned with backend (Regulator = assignee only; creator blocked except Super Admin).
- **DecisionBar:** Accepts optional `capabilities`; when provided, uses it to show/hide Approve/Reject and to show `reasonIfDisabled` when both disabled.
- **ScriptWorkspace:** Computes capabilities and passes to DecisionBar so UI only shows buttons when backend would allow.

### 3. Error message

- Backend message when blocking (non-admin creator):  
  `"Conflict of interest: You cannot approve/reject your own script. Ask an admin or the assigned reviewer to make the decision."`

---

## Verification

1. **Regulator, script assigned to them (not creator):** 200.
2. **Regulator, script they created or not assigned to them:** 403; UI shows reason.
3. **Admin, script they did not create:** 200.
4. **Admin, script they created:** 403 (no override).
5. **Super Admin, any script including own:** 200 (override).

See **docs/SCRIPT_DECISION_VERIFICATION.md** for manual test steps and audit logging details. No SQL/RLS changes are required; the policy is enforced in the Edge Function.
