# Permissions Map (RBAC Baseline)

Baseline for roles (Admin, Super Admin, Regulator), permissions, and which sections/actions each role enables.  
Used for UI gating and to ensure the frontend never shows actions the backend will deny (403).

---

## Source of truth references

### DB tables

- **roles** — `id`, `key` (e.g. `admin`, `regulator`, `super_admin`), `name` (e.g. "Admin", "Regulator").  
  Migrations: `0011_rbac.sql`, `0012_rbac_seed.sql`.
- **permissions** — `id`, `key` (e.g. `manage_users`, `view_reports`, `approve_scripts`).  
  Migrations: `0011_rbac.sql`, `0012_rbac_seed.sql`, `20260214040000_add_view_permissions.sql`, `20260214065500_approval_permissions.sql`, `20260214071000_view_scripts_permission.sql`.
- **role_permissions** — links roles to permissions.  
  Migration: `0011_rbac.sql`; seed in `0012_rbac_seed.sql`, `20260214040000`, `20260214065500`.
- **user_roles** — links `auth.users` to roles (one row per user–role).  
  Migration: `0011_rbac.sql`; populated by invite flow and admin user management.

### RPCs

- **get_my_permissions()** — returns `text[]` of permission keys for `auth.uid()`.  
  Source: `user_roles` → `role_permissions` → `permissions`.  
  Migration: `0011_rbac.sql`. Used by RLS (e.g. invites, audit) and can be used by Edge/backend; frontend gets equivalent data via `/me`.
- **is_admin_user()** — returns true if current user has Admin/Super Admin/Regulator role or `access_control` in metadata.  
  Migration: `20260214072000_update_is_admin_user.sql`. Used by RLS.
- **user_can_approve_scripts(p_user_id UUID)** — true if user has `approve_scripts` or `manage_script_status`.  
  Migration: `20260214070000_enhanced_audit_events.sql`. Used by script decision Edge.
- **user_can_reject_scripts(p_user_id UUID)** — true if user has `reject_scripts` or `manage_script_status`.  
  Migration: `20260214070000_enhanced_audit_events.sql`. Used by script decision Edge.

### Edge functions

- **GET /me** — returns current user profile; **role** from DB (`user_roles` → `roles.name`); **permissions** from DB (`user_roles` → `role_permissions` → `permissions.key`). Authoritative for UI role label and permission list.
- **GET/POST /users**, **POST /invites** — require `manage_users` or `access_control:manage` (checked via DB role_permissions).
- **GET/POST /scripts**, **GET /scripts/:id**, **GET /scripts/:id/decision/can**, **POST /scripts/:id/decision** — access by owner/assignee or admin; decision “can” uses RPCs above.
- **GET/POST /tasks** — access by job owner or assignee; admin can see all.

### Frontend

- **authStore** — role, permissions, allowedSections from `/me` (DB-backed).  
  `hasPermission(key)`, `hasSection(sectionId)` drive nav and route guards.
- **ProtectedRoute** — uses `requiredPermission` / `requiredSection`; shows Access denied page if not allowed.
- **AppLayout** — sidebar filters links by `hasSection` / `hasPermission` (no Access Control for Regulator).
- **Decision bar** — capabilities from GET `/scripts/:id/decision/can` (backend predicate); shown only when result is for current script id to avoid flicker.

---

## Role → permissions (which sections/actions they enable)

| Role (key)   | Permissions (keys) | Sections / actions enabled |
|-------------|---------------------|----------------------------|
| **Super Admin** | All permissions (CROSS JOIN in seed) | Access Control, Clients, Scripts, Tasks, Glossary, Reports, Audit; create users, upload/assign, approve/reject, manage glossary, view audit. |
| **Admin**       | All permissions (CROSS JOIN in seed) | Same as Super Admin. |
| **Regulator**   | view_reports, manage_glossary; view_clients, view_scripts, view_findings, view_tasks; approve_scripts, reject_scripts (no manage_users, no view_audit, no assign_tasks) | Clients (view), Scripts (view), Tasks (view own), Glossary (manage), Reports (view); approve/reject scripts per policy. No Access Control, no Audit. |

Permission keys referenced in app:  
`manage_users`, `access_control:read`, `access_control:manage`, `manage_glossary`, `manage_companies`, `assign_tasks`, `view_reports`, `upload_scripts`, `run_analysis`, `override_findings`, `generate_reports`, `view_clients`, `view_scripts`, `view_findings`, `view_tasks`, `view_audit`, `approve_scripts`, `reject_scripts`, `manage_script_status`.

---

## Access matrix (by area)

| Area            | Super Admin | Admin | Regulator |
|-----------------|-------------|--------|------------|
| **Access Control** | ✅ Full (manage_users) | ✅ Full | ❌ Hidden in nav; direct URL → Access denied / “No access” |
| **Clients**     | ✅ View + manage | ✅ View + manage | ✅ View (view_clients) |
| **Scripts**     | ✅ View + upload + assign | ✅ View + upload + assign | ✅ View (view_scripts) |
| **Tasks**       | ✅ View all / assign | ✅ View all / assign | ✅ View own (assignee) |
| **Glossary (Lexicon)** | ✅ Manage | ✅ Manage | ✅ Manage (manage_glossary) |
| **Reports**     | ✅ View + generate | ✅ View + generate | ✅ View (view_reports) |
| **Audit**       | ✅ View | ✅ View | ❌ No view_audit |

---

## Actions

| Action              | Super Admin | Admin | Regulator |
|---------------------|-------------|--------|-----------|
| Approve / Reject script | ✅ | ✅ | ✅ (approve_scripts / reject_scripts; policy may restrict to assignee) |
| Create users / invites | ✅ | ✅ | ❌ |
| Upload scripts      | ✅ | ✅ | ✅ (ownership/assignee) |
| Assign tasks        | ✅ | ✅ | ❌ |
| Manage lexicon      | ✅ | ✅ | ✅ |
| View reports        | ✅ | ✅ | ✅ |

---

## Notes

- **Role truth source:** `/me` and UI role label come from DB mapping (`user_roles` → `roles.name`). Invite flow sets `user_metadata.role` for convenience; DB is authoritative.
- **Frontend gating:** Restricted pages/actions use backend “can” result or permission list from `/me` (which reflects `get_my_permissions()`-equivalent data). Access Control: if forbidden, show friendly “No access” state, no toast.
- **Decision bar:** Based on per-script canDecision result (GET `/scripts/:id/decision/can`) for the current script id; no flicker from stale or mismatched script id.
