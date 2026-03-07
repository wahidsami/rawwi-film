# Permissions, User Types, and Visibility — Audit & Discovery Report

**Date:** 2026-03-07  
**Scope:** Who can see what (scripts, reports, clients, etc.) by role; current bugs and fixes.

---

## 1. User types (roles)

| Role key (DB) | Display name   | Source of truth |
|---------------|----------------|------------------|
| `super_admin` | Super Admin    | `roles` table → `user_roles` |
| `admin`       | Admin          | same |
| `regulator`   | Regulator      | same |

- **Where roles are stored:** `public.roles` (id, key, name) and `public.user_roles` (user_id, role_id) linking `auth.users` to roles.
- **How the app resolves role:** Edge function **GET /me** reads `user_roles` → `roles.name` and returns it as `user.role`. So the **DB is the source of truth** for the UI.
- **Seeding a super admin:** Use `supabase/seed_super_admin.sql` (Option A: assign existing user to `super_admin` in `user_roles`).

---

## 2. Where “admin” is checked (two places)

| Layer | How “admin” is determined | Used by |
|-------|----------------------------|--------|
| **Edge functions** | `isUserAdmin(supabase, uid)` in `_shared/roleCheck.ts` | Scripts, Reports, Dashboard, Findings, etc. |
| **Database RLS**   | `is_admin_user()` in PostgreSQL | Policies on `scripts`, `clients`, `analysis_jobs`, `analysis_reports`, `analysis_findings` |

- **Edge:** `isUserAdmin` queries `user_roles` → `roles.key` and returns true if key is `admin`, `super_admin`, or `regulator`.
- **RLS:** `is_admin_user()` (migration `20260214072000_update_is_admin_user.sql`) reads **`auth.users.raw_user_meta_data->>'role'`** (and `allowedSections`). It does **not** read `user_roles`.

**Resulting bug:** If a user is made admin only via `user_roles` (e.g. seed_super_admin Option A) and their `auth.users.raw_user_meta_data.role` is not set, then:

- **Edge functions** see them as admin (from `user_roles`) → they can list all scripts, open any report, etc. if the code path checks `isAdmin`.
- **RLS** sees them as non-admin (metadata not set) → any query that uses the **user’s JWT** (e.g. anon key + user token) and hits RLS will filter to “own” data only.

So: **two different sources of truth** → admin can end up seeing only their own scripts/reports if RLS is in the path, or if the Edge function incorrectly thinks they’re not admin.

---

## 3. What each role can see (intended vs current)

### 3.1 Scripts

| Action | Non-admin (creator/assignee) | Admin / Super Admin / Regulator (intended) | Current implementation |
|--------|-------------------------------|--------------------------------------------|-------------------------|
| List (GET /scripts) | Only own + assigned | All scripts | Edge: if `isUserAdmin` → no filter (all). So **correct** when Edge is used. |
| View one (GET /scripts/:id) | Own or assigned | Any | Edge: `isAdmin` → allow. **Correct.** |
| Editor, versions, highlight-preference | Own or assigned | Any | Edge: after fix, `isAdmin` → allow. **Correct.** |
| Create / update / delete | Own (or assignee for update) | All | Edge: PATCH/DELETE still only allow `created_by === uid`. **Admin cannot edit others’ scripts** (might be intentional). |

**RLS (scripts table):** “Admins can view all scripts” uses `is_admin_user()`. If that returns false (metadata not set), admin only sees rows allowed by “Users can view own or assigned scripts.”

### 3.2 Reports (analysis_reports)

| Action | Non-admin | Admin (intended) | Current implementation |
|--------|-----------|------------------|-------------------------|
| List all (GET /reports) | Only own (via job ownership) | All reports | Edge uses **service_role** → RLS bypassed → returns **all** rows. So list is “all” for everyone. If in your deployment reports list is filtered, another layer (e.g. different client) may be applying RLS. |
| View one (GET /reports?id= / jobId=) | Own job only | Any | Edge: if `isAdmin` → skip ownership check; else `checkOwnership`. **Correct when isAdmin is true.** |
| List by script (GET /reports?scriptId=) | Script owner or assignee | Any | Edge: `isAdmin` → allow. **Correct.** |

**RLS (analysis_reports):** “Admins can view all analysis_reports” uses `is_admin_user()`. If false, user only sees reports for jobs where `analysis_jobs.created_by = auth.uid()`.

### 3.3 Dashboard (GET /dashboard/stats)

- Uses `isUserAdmin`; when true, queries are not restricted to own tasks/jobs/scripts. So **correct** when Edge sees user as admin.

### 3.4 Clients

- RLS: “Admins can view all clients” uses `is_admin_user()`. Same metadata vs `user_roles` mismatch if metadata is not set.

---

## 4. Root cause summary

- **Single source of truth for “is this user admin?”:** Should be **`user_roles`** (and optionally `roles.key`), not `auth.users.raw_user_meta_data`.
- **Current RLS:** Uses `is_admin_user()` reading only **metadata** → admins created only via `user_roles` (e.g. seed) are not considered admin by RLS → they see only their own data where RLS applies.
- **Edge functions:** Use `user_roles` via `isUserAdmin` and (for reports) **service_role** (bypass RLS). So list-all reports can show all; single-report and script endpoints depend on `isAdmin`. If for some reason `isUserAdmin` is false in production (e.g. role key mismatch, join issue), admin would get 403 on “other” scripts/reports.

---

## 5. Fix applied: RLS aligned with user_roles

**Migration:** `supabase/migrations/20260214073100_is_admin_user_from_user_roles.sql`

- **Change:** `is_admin_user()` is redefined to derive admin status from **`user_roles`** and **`roles`** (same logic as Edge `isUserAdmin`): user has at least one role with `roles.key` in (`super_admin`, `admin`, `regulator`). Optionally keep a fallback to `raw_user_meta_data->>'role'` for backwards compatibility.
- **Effect:** RLS policies that use `is_admin_user()` (scripts, clients, analysis_jobs, analysis_reports, analysis_findings) will treat any user with a row in `user_roles` for super_admin/admin/regulator as admin, even if their auth metadata is not set.
- **After applying:** Redeploy or run migrations, then verify as super_admin: list scripts (should see all), list reports (all), open any script/report (no 403).

---

## 6. Recommendation: single source of truth

- **Use `user_roles` + `roles.key` everywhere** for “is this user admin?” (and for “is regulator?”, “is super_admin?” if needed).
- **Stop relying on `auth.users.raw_user_meta_data.role`** for RLS; use it only for display or legacy fallback.
- **Invite flow:** When creating a user and assigning a role, insert into `user_roles` and optionally set `user_metadata.role` for display; RLS should use `user_roles` (via the updated `is_admin_user()`).
- **Optional:** Add a small “Permissions” or “Role” debug section in the app (or a one-off script) that shows for the current user: role from `/me`, and whether `user_roles` has super_admin/admin/regulator, so you can confirm alignment.

---

## 7. Quick verification checklist (after migration)

As the seeded super_admin user:

1. **Scripts:** List shows all scripts (not only yours). Opening any script (workspace, editor, versions) does not 403.
2. **Reports:** List shows all reports. Opening any report by id or jobId does not 403.
3. **Clients:** List shows all clients.
4. **Dashboard:** Stats reflect all scripts/jobs/reports (or the intended scope for admins).

If any of these fail, check: (1) migration applied, (2) user has a row in `user_roles` with role_id for super_admin, (3) Edge function logs for `isAdmin` and any 403 responses.

---

## 8. User creation and role-based visibility

### 8.1 How users are created

| Entry point | Flow | Role & sections |
|-------------|------|------------------|
| **Access Control → Add User** | `invitesApi.sendInvite({ email, name, role, allowedSections })` → **POST /invites** | Invite creates auth user, sets `user_metadata.name`, `user_metadata.role` (display), `user_metadata.allowedSections` (if provided). Inserts **user_roles** (role_id from `roles.key`). |
| **Edit user (Access Control)** | `usersApi.updateUser({ userId, name, roleKey, status, allowedSections })` → **PATCH /users** | Updates profile, **user_roles** (via `ensureUserRole`), and `user_metadata` (name, allowedSections). |

- **Role** is stored in DB: `user_roles` + `roles` (source of truth for API/RLS). Display name is also in `user_metadata.role`.
- **allowedSections** is stored only in `auth.users.user_metadata.allowedSections`. It is **not** in `user_roles` or permissions tables. Used only by the frontend to show/hide sidebar links (see AppLayout: `hasSection(link.section)`).

### 8.2 What each role can see (backend vs UI)

**Backend (API + RLS):** Determined by **role** (user_roles + roles):

| Role | Scripts | Reports | Clients | Tasks | Glossary | Access Control | Audit |
|------|--------|---------|---------|-------|----------|----------------|-------|
| **Super Admin** | All | All | All | All | Full | Full | Full |
| **Admin** | All | All | All | All | Full | No | View |
| **Regulator** | View (as per RLS) | View all (isAdmin) | View | View | Full | No | — |

**UI (sidebar):** Determined by **allowedSections** when present; otherwise **defaults by role** (authStore `getDefaultSectionsForRole`):

| Role | Default sections (if allowedSections not set) |
|------|---------------------------------------------|
| Super Admin | clients, tasks, glossary, reports, access_control, audit |
| Admin | clients, tasks, glossary, reports, audit (no access_control) |
| Regulator | clients, reports, glossary |

- If `user_metadata.allowedSections` is set (from invite or edit), the user sees **only** those sections in the sidebar. So you can give an Admin role but restrict them to e.g. only Clients and Reports in the UI.
- If `allowedSections` is missing or empty, the app uses the default list above for that role.

### 8.3 Add User modal: role dropdown vs section toggles

- **Role dropdown:** Sets **role** (admin / super_admin / regulator). This controls backend permissions and the **default** sections.
- **Section toggles:** Optional **override** for which dashboard sections the user sees. They are **functional**: stored in `user_metadata.allowedSections` on invite and on user update; `/me` returns them; the sidebar uses `hasSection(sectionId)` to show/hide links.
- **Behavior:** If you send no sections (all toggles off), the backend does not set `allowedSections` → user gets role-based default sections. If you toggle some sections on, the user sees only those sections (and can be more restricted than the role’s default).
- **Possible confusion:** Both “Role” and “Sections” affect what the user sees: Role → default set; Sections → explicit override. So the modal uses two controls for related but distinct things (backend role vs UI visibility). Recommendation: keep both but add short labels so it’s clear that Role = permissions, Sections = “which dashboard areas to show (optional; leave default for full access for this role).”
