# QA Role & Permissions Fix Report

**RBAC + data refresh consistency stabilization.**  
Roles: Admin, Super Admin, Regulator. Backend: Supabase (RLS + Edge Functions).  
UI must never show actions the backend will deny (403).

**Permissions baseline:** [docs/PERMISSIONS_MAP.md](./PERMISSIONS_MAP.md).

---

## Per-issue: root cause, fix, files touched, verify in prod

### A. Regulator gets error toast when opening Access Control

**Root cause:** Role/permissions came from `user_metadata` first in `/me`; for new Regulator (no metadata.role) the code defaulted to "Admin", so the UI assumed `manage_users` and showed Access Control. Direct hit to `/access-control` triggered GET /users → 403 → error toast.

**Fix:** (1) `/me` resolves role from DB (`user_roles` → `roles.name`) as source of truth. (2) authStore derives `allowedSections` from role when missing so Regulator does not get `access_control`. (3) Access Control page: on 403 from load users, do not toast; set `accessDenied` and show inline “You do not have access to view this section”.

**Files touched:**  
`supabase/functions/me/index.ts`, `apps/web/src/store/authStore.ts`, `apps/web/src/pages/AccessControl.tsx`

**Verify in prod:** Log in as Regulator → Access Control is not in sidebar; open `/access-control` directly → Access denied screen, no error toast. As Admin → Access Control visible and users list loads.

---

### B. Regulator label shows “Admin” even when role is Regulator

**Root cause:** `/me` used `meta.role` first; invite flow did not set `user_metadata.role`, so new Regulator had empty role and fallback was “Admin” when `roleIds.length > 0`.

**Fix:** (1) `/me` uses DB role first: resolve from `user_roles` → `roles` and use `roles.name` for display. (2) Invite flow sets `user_metadata.role` to display name (e.g. "Regulator", "Admin", "Super Admin") for consistency; DB remains authoritative.

**Files touched:**  
`supabase/functions/me/index.ts`, `supabase/functions/invites/index.ts`, `apps/web/src/store/authStore.ts`

**Verify in prod:** Create Regulator via Access Control invite → set password → log in; top-left role label shows “Regulator”, not “Admin”.

---

### C. Task fails to open after clicking it (for all users)

**Root cause:** Tasks list (GET /tasks) returns jobs + assigned scripts; workspace expects the script in the global `scripts` list. For assignees or when list was fetched before assignment, script was missing → `script` undefined and page could not render.

**Fix:** (1) GET /scripts: admin sees all scripts (bypass filter). (2) New GET /scripts/:id: return single script if user is owner, assignee, or admin. (3) Frontend: `scriptsApi.getScript(id)`; ScriptWorkspace fetches script by id when not in list and uses it (state `scriptFetched`).

**Files touched:**  
`supabase/functions/scripts/index.ts`, `apps/web/src/api/index.ts`, `apps/web/src/pages/ScriptWorkspace.tsx`

**Verify in prod:** As any user with tasks, click a task → workspace opens. As admin, open a task for a script assigned to someone else → opens correctly.

---

### D. Approve/Reject option disappears quickly for Regulator/Admin

**Root cause:** Decision bar used `decisionCan` that could be for a previous script or not yet loaded for the current script → flicker. Full page reload after decision was jarring.

**Fix:** (1) Track `decisionCanScriptId` with `decisionCan`; show bar only when result is for current script (`decisionCanScriptId === script?.id`). (2) Pass capabilities to DecisionBar only when `showDecisionBar` is true (avoids stale result). (3) Remove full page reload from DecisionBar; parent `onDecisionMade` calls `updateScript`, `fetchInitialData()` and updates local script state.

**Files touched:**  
`apps/web/src/pages/ScriptWorkspace.tsx`, `apps/web/src/components/DecisionBar.tsx`

**Verify in prod:** Open script in workspace as Regulator or Admin; decision bar appears after load and does not flicker. Approve or reject → bar updates without full reload; lists refresh.

---

### E. Review status fails to update on company profile after approve/reject

**Root cause:** Company profile reads script status from global scripts list; after decision the list was not refreshed.

**Fix:** `onDecisionMade` in ScriptWorkspace calls `updateScript(script.id, { status })` and `fetchInitialData()` so scripts (and company summary) refresh.

**Files touched:**  
`apps/web/src/pages/ScriptWorkspace.tsx`, `apps/web/src/components/DecisionBar.tsx`

**Verify in prod:** Approve or reject a script → go to Clients → open that client; script shows Approved/Rejected and summary reflects it.

---

### F. Script upload fails when assigning user during “Add new script” flow (works when importing in analyze window)

**Root cause:** Client flow uses POST `/raawi-script-upload` (multipart); it returns `versionId`. Failures were likely due to wrong role/permission (A/B) or auth/payload. Import in analyze window uses `getUploadUrl` + `createVersion` + `extractText` (different path but same backend capabilities).

**Fix:** (1) Role/permission fixes (A, B) ensure creator has correct role so upload is not blocked. (2) Confirmed `raawi-script-upload` returns `{ success, fileUrl, path, fileName, fileSize, versionId, versionNumber }`. ClientDetails already uses `uploadResult.versionId` for extraction. No change to payload order; ensure auth header is sent (existing fetch with Bearer token).

**Files touched:**  
`supabase/functions/me/index.ts`, `supabase/functions/invites/index.ts` (role fixes); `apps/web/src/pages/ClientDetails.tsx` (already correct usage of versionId).

**Verify in prod:** As Admin, from client screen add new script, assign to another user, upload file → script created, document uploaded, text extracted; no “script upload failed” when backend and role are correct.

---

### G. Scripts filter page does not update by status; scripts remain draft

**Root cause:** After approve/reject, scripts list was not refetched, so filters showed stale “draft”.

**Fix:** After decision, `onDecisionMade` calls `fetchInitialData()` so scripts list (and filters) get fresh status from backend.

**Files touched:**  
`apps/web/src/pages/ScriptWorkspace.tsx`, `apps/web/src/components/DecisionBar.tsx`

**Verify in prod:** Approve or reject a script → Scripts page and status filters show updated statuses without manual refresh.

---

### H. Glossary: after deleting a term, user cannot add same term again (“already exists”)

**Root cause:** `slang_lexicon` has UNIQUE on `normalized_term`; delete is soft (`is_active = false`). Re-adding the same term tried INSERT and hit unique constraint.

**Fix:** POST /lexicon/terms: before insert, select by `normalized_term`. If row exists and `is_active = false`, update it (reactivate + set new fields) and return; if `is_active = true` return 409; else insert as before.

**Files touched:**  
`supabase/functions/lexicon/index.ts`

**Verify in prod:** Add term → deactivate/delete → add same term again → success (reactivated). Add same term while still active → 409.

---

### I. Client screen status not updating (pending/approved not reflected)

**Root cause:** Same as E: client screen reads from global scripts; list was not refreshed after decision.

**Fix:** Same as E: `onDecisionMade` calls `fetchInitialData()` so client screen gets updated script statuses.

**Files touched:**  
`apps/web/src/pages/ScriptWorkspace.tsx`, `apps/web/src/components/DecisionBar.tsx`

**Verify in prod:** Approve/reject script → open Clients → that client’s scripts and summary show correct status.

---

### J. Reports status not updating anywhere

**Root cause:** Reports depend on script/report data; lists were cached and not refetched after decision.

**Fix:** `fetchInitialData()` after decision refreshes scripts and related data. Reports page loads its data when opened; scripts/companies are refetched so any report views that depend on script status see fresh data when user navigates to Reports.

**Files touched:**  
`apps/web/src/pages/ScriptWorkspace.tsx`, `apps/web/src/components/DecisionBar.tsx`

**Verify in prod:** After approving/rejecting a script, open Reports and confirm report/script status is updated when the list is loaded.

---

## Files changed (summary)

| Area | Files |
|------|--------|
| **RBAC / me / invite** | `supabase/functions/me/index.ts`, `supabase/functions/invites/index.ts`, `apps/web/src/store/authStore.ts` |
| **Access Control UI** | `apps/web/src/pages/AccessControl.tsx` |
| **Scripts / tasks / workspace** | `supabase/functions/scripts/index.ts`, `apps/web/src/api/index.ts`, `apps/web/src/pages/ScriptWorkspace.tsx` |
| **Decision bar / workflows** | `apps/web/src/components/DecisionBar.tsx` |
| **Lexicon** | `supabase/functions/lexicon/index.ts` |
| **Docs** | `docs/PERMISSIONS_MAP.md`, `docs/QA_ROLE_PERMISSIONS_FIX_REPORT.md` |

---

## Smoke checks (key cases)

Use these to validate in staging/prod:

1. **Regulator cannot access Access Control**  
   Log in as Regulator → sidebar has no Access Control; go to `/access-control` → Access denied screen, no toast.

2. **Regulator sees correct role label**  
   Top-left shows “Regulator” (from `/me` backed by DB role).

3. **Assignee can open task & script**  
   As assignee, open Tasks → click a task → workspace opens for that script (fetched by id if not in list).

4. **Approve/reject buttons stable**  
   Open script in workspace → decision bar appears after load, does not flicker; approve/reject → bar updates, no full reload.

5. **Status refresh after decision**  
   Approve or reject → go to Clients, Scripts, Reports → script status is updated everywhere without manual refresh.

6. **Glossary re-add after soft delete**  
   Add term → delete (deactivate) → add same term again → success; term is reactivated.

---

## Constraints

- RLS and backend permission checks were not weakened.
- Access Control remains admin-only; non-admin users see “No access” or hidden nav, not raw 403 toasts.
- UI is gated to match backend: no buttons for actions the backend would reject.

---

## After changes

- **Build:** `pnpm --filter web build` (or `pnpm -w build` if defined).
- **Lint:** `pnpm -w lint` if available.
- **Commits:** fix(rbac): … ; fix(ui): … ; fix(workflows): … ; docs: permissions map + QA report.
- **Push:** `git push origin main`.
