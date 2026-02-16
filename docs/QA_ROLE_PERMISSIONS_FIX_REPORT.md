# QA Role & Permissions Fix Report

## Summary

Fixes address: Regulator seeing Access Control and wrong role label; task open failure; Approve/Reject bar flicker; review status and report status not updating; script upload when assigning; scripts filters; glossary re-add after delete; and consistent “no access” handling without scary errors.

**Permissions baseline:** See [docs/PERMISSIONS_MAP.md](./PERMISSIONS_MAP.md).

---

## 1) Regulator sees error popup when opening Access Control

**Root cause:**  
- Role and permissions came from `user_metadata` first in `/me`; when metadata was empty (e.g. new Regulator from invite), role defaulted to "Admin", so the UI thought the user had `manage_users` and showed Access Control.  
- Nav and route guard relied on that; direct hit to `/access-control` then called GET /users → 403 → raw toast.

**Changes:**  
- **supabase/functions/me/index.ts**: Role is now resolved from DB (`user_roles` → `roles.name`) as source of truth; only fallback to metadata when no role in DB.  
- **apps/web/src/store/authStore.ts**: After `/me`, `allowedSections` is derived from role when missing so Regulator no longer gets `access_control`.  
- **apps/web/src/pages/AccessControl.tsx**: On 403 from load users, no toast; set `accessDenied` and show inline “You do not have access to view this section” (no raw error).  
- **Route guard**: Unchanged; `requiredPermission="manage_users"` still shows Access Denied page when user lacks permission.

**Verify:**  
- Log in as Regulator → Access Control not in sidebar; open `/access-control` directly → “Access denied” page, no toast.  
- With Admin → Access Control visible and users list loads.

---

## 2) Creating Regulator account still shows “Admin” label

**Root cause:**  
- `/me` used `meta.role` first; invite flow did not set `user_metadata.role`, so for new Regulator `meta.role` was empty and code fell back to “Admin” when `roleIds.length > 0`.

**Changes:**  
- **supabase/functions/me/index.ts**: Role is taken from DB (`user_roles` → `roles.name`) first; display role no longer defaults to Admin for every user with a role.  
- **supabase/functions/invites/index.ts**: When creating the auth user, set `user_metadata.role` to the display name (e.g. "Regulator", "Admin", "Super Admin") for consistency.

**Verify:**  
- Create new user with role Regulator via Access Control → invite → set password → log in; top-left role label shows “Regulator”, not “Admin”.

---

## 3) Task fails to open after clicking it

**Root cause:**  
- Tasks list (GET /tasks) returns analysis jobs and assigned scripts; workspace expects the script to be in the global `scripts` list. For assignees or when list was fetched before assignment, the script might be missing, so `script` was undefined and the page could not show.

**Changes:**  
- **supabase/functions/scripts/index.ts**:  
  - GET /scripts list: admin bypass so admins see all scripts.  
  - New GET /scripts/:id: returns one script if the user is owner, assignee, or admin.  
- **apps/web/src/api/index.ts**: Added `getScript(id)`.  
- **apps/web/src/pages/ScriptWorkspace.tsx**: When `id` is set and script is not in the list, fetch script by id and use it (state `scriptFetched`); effective script = from list or fetched.

**Verify:**  
- As any user with tasks, click a task → workspace opens for that script (from list or fetched by id).  
- As admin, open a task for a script assigned to someone else → opens correctly.

---

## 4) Approve/Reject option disappears quickly for Regulator and Admin

**Root cause:**  
- Decision bar used `decisionCan` that could be from a previous script or not yet loaded for the current script, causing brief wrong state.  
- Full page reload after decision caused a jarring refresh.

**Changes:**  
- **apps/web/src/pages/ScriptWorkspace.tsx**:  
  - Track `decisionCanScriptId` with `decisionCan`; only treat decision state as valid when `decisionCanScriptId === script?.id`.  
  - `showDecisionBar`: show bar only when permission state is loaded for the current script (`showDecisionBar && decisionCan` used for capabilities).  
  - `onDecisionMade`: call `updateScript`, update `scriptFetched` if used, and `fetchInitialData()` instead of reload.  
- **apps/web/src/components/DecisionBar.tsx**: Removed `setTimeout(() => window.location.reload(), 1000)`; parent handles refresh.

**Verify:**  
- Open script in workspace as Regulator/Admin; decision bar appears after load and does not flicker.  
- Approve or reject → bar updates/ disappears without full page reload; list and client/reports refresh.

---

## 5) Review status fails to update on company profile after approving/rejecting script

**Root cause:**  
- Client/company summary reads script status from the global scripts list; after decision the list was not refreshed.

**Changes:**  
- **apps/web/src/pages/ScriptWorkspace.tsx**: `onDecisionMade` calls `updateScript(script.id, { status })` and `fetchInitialData()`, so scripts (and thus company summary) are updated.  
- **apps/web/src/components/DecisionBar.tsx**: No full reload; parent refetch drives UI.

**Verify:**  
- Approve or reject a script → go to Clients → open that client; script shows as Approved/Rejected and summary reflects it.

---

## 6) Script upload fails when assigning user during “Add new script” flow

**Root cause:**  
- Client “Add new script” uses POST `/raawi-script-upload` (multipart) and expects `versionId` in the JSON response.  
- Backend already returns `versionId`; failure was likely due to wrong role/permission (fixed by #1/#2) or a one-off (e.g. network).  
- No change to upload payload/order; invite and role fixes ensure the creating user has correct permissions and that assignee gets correct role.

**Changes:**  
- Confirmed **supabase/functions/raawi-script-upload/index.ts** returns `{ success, fileUrl, path, fileName, fileSize, versionId, versionNumber }`.  
- Role and permission fixes (#1, #2) ensure the user creating the script and uploading is not mistaken for a restricted role.  
- **apps/web/src/pages/ClientDetails.tsx**: Already uses `uploadResult.versionId` for extraction; no payload/order change.

**Verify:**  
- As Admin, add new script from client, assign to another user, upload file → script created, document uploaded, versionId used for extraction; no “script upload failed” when backend and role are correct.

---

## 7) Filters on Scripts Management don’t update list / everything stays “draft”

**Root cause:**  
- Filters are correct (status === 'approved' | 'rejected' | 'review_required' | 'in_review'); backend returns lowercase status.  
- After a decision, the scripts list was not refetched, so the UI showed stale “draft” until refresh.

**Changes:**  
- After decision, `onDecisionMade` calls `fetchInitialData()`, so scripts list (and filters) get fresh data.  
- GET /scripts returns correct status from DB; no change to filter logic.

**Verify:**  
- Change script status (approve/reject) → Scripts page and filters show updated statuses without manual refresh.

---

## 8) Glossary: cannot add same term after deleting (says already present)

**Root cause:**  
- Table `slang_lexicon` has UNIQUE on `normalized_term`; “delete” is soft (is_active = false). Insert of the same term again hit unique and returned 409.

**Changes:**  
- **supabase/functions/lexicon/index.ts** (POST /lexicon/terms): Before insert, select by `normalized_term`. If row exists and `is_active = false`, update it (reactivate and set new fields) and return that row; if `is_active = true`, return 409; otherwise insert as before.

**Verify:**  
- Add term → deactivate/delete → add same term again → success (term reactivated).  
- Add same term while it is still active → 409 as before.

---

## 9) Status for script/pending/approved not updating on Client screen

**Root cause:**  
- Same as #5: client screen reads from global scripts; list was not refreshed after decision.

**Changes:**  
- Same as #5: `onDecisionMade` calls `fetchInitialData()` so client screen gets updated script statuses.

**Verify:**  
- Approve/reject script → open Clients → that client’s scripts and summary show correct status.

---

## 10) Reports section does not update statuses

**Root cause:**  
- Report status depends on script/report data; if the reports list or related scripts are cached and not refetched after a decision, the UI showed old status.

**Changes:**  
- `fetchInitialData()` after decision refreshes scripts and related data; reports that depend on script status can be refetched when the user opens Reports or navigates (existing behavior).  
- No separate reports cache invalidation added; scripts and client data are the main source for “status” on client/report views.

**Verify:**  
- After approving/rejecting a script, open Reports and confirm report/script status is updated when the list is loaded.

---

## Files changed (by area)

| Area | Files |
|------|--------|
| **RBAC / me / invite** | `supabase/functions/me/index.ts`, `supabase/functions/invites/index.ts`, `apps/web/src/store/authStore.ts` |
| **Access Control UI** | `apps/web/src/pages/AccessControl.tsx` |
| **Scripts / tasks / workspace** | `supabase/functions/scripts/index.ts`, `apps/web/src/api/index.ts`, `apps/web/src/pages/ScriptWorkspace.tsx` |
| **Decision bar** | `apps/web/src/components/DecisionBar.tsx` |
| **Lexicon** | `supabase/functions/lexicon/index.ts` |
| **Docs** | `docs/PERMISSIONS_MAP.md`, `docs/QA_ROLE_PERMISSIONS_FIX_REPORT.md` |

---

## Constraints respected

- RLS and backend permission checks were not weakened.  
- Access Control remains admin-only; non-admin users see “No access” or hidden nav, not raw 403 toasts.  
- UI is gated to match backend: no buttons for actions the backend would reject.

---

## How to run checks

1. **Lint:** `pnpm -w lint` (if available).  
2. **Build:** `pnpm -w build`.  
3. **Manual:** Log in as Super Admin, Admin, and Regulator; repeat verification steps above for Access Control, role label, tasks, approve/reject, client/reports status, script upload with assignee, scripts filters, glossary re-add.
