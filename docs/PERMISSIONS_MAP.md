# Permissions Map (RBAC Baseline)

## Source of truth

- **DB**: `roles`, `permissions`, `role_permissions`, `user_roles` (supabase migrations: `0011_rbac.sql`, `0012_rbac_seed.sql`, `20260214040000_add_view_permissions.sql`, `20260214065500_approval_permissions.sql`, `20260214071000_view_scripts_permission.sql`).
- **RPCs**: `get_my_permissions()`, `is_admin_user()`, `user_can_approve_scripts(p_user_id)`, `user_can_reject_scripts(p_user_id)` (migrations: `0011_rbac.sql`, `20260214072000_update_is_admin_user.sql`, `20260214070000_enhanced_audit_events.sql`).
- **Edge**: `/me` (role + permissions from DB), `/users`, `/invites` (manage_users / access_control:manage), `/scripts` (owner/assignee or admin), `/tasks` (owner or admin), script decision checks via RPCs.
- **Frontend**: `authStore` (role, permissions, allowedSections from `/me`), `hasPermission` / `hasSection`, `ProtectedRoute`, sidebar filter in `AppLayout.tsx`.

## Role → permissions (DB seed)

| Role (key)   | Permissions (keys) |
|-------------|----------------------|
| Super Admin | All permissions (CROSS JOIN) |
| Admin       | All permissions (CROSS JOIN) |
| Regulator   | view_reports, manage_glossary; plus view_clients, view_scripts, view_findings, view_tasks (from 20260214040000); plus approve_scripts, reject_scripts (from 20260214065500). No manage_users. |

## Access matrix (by area)

| Area            | Super Admin | Admin | Regulator |
|-----------------|-------------|--------|------------|
| **Access Control** | ✅ Full (manage_users) | ✅ Full | ❌ Hidden in nav; direct URL → Access Denied or friendly “No access” |
| **Clients**     | ✅ View + manage | ✅ View + manage | ✅ View (view_clients) |
| **Scripts**     | ✅ View + upload + assign | ✅ View + upload + assign | ✅ View scripts (view_scripts) |
| **Tasks**       | ✅ View all / assign | ✅ View all / assign | ✅ View own (assignee) |
| **Glossary (Lexicon)** | ✅ Manage | ✅ Manage | ✅ Manage (manage_glossary) |
| **Reports**     | ✅ View + generate | ✅ View + generate | ✅ View (view_reports) |
| **Audit**       | ✅ View | ✅ View | ❌ No view_audit |

## Actions

| Action              | Super Admin | Admin | Regulator |
|---------------------|-------------|--------|-----------|
| Approve / Reject script | ✅ | ✅ | ✅ (when has approve_scripts/reject_scripts and policy allows) |
| Create users / invites | ✅ | ✅ | ❌ |
| Upload scripts      | ✅ | ✅ | ✅ (via view_scripts + ownership) |
| Assign tasks        | ✅ | ✅ | ❌ (no assign_tasks) |
| Manage lexicon      | ✅ | ✅ | ✅ |
| View reports        | ✅ | ✅ | ✅ |

## Notes

- Role label in UI comes from `/me`; role is now resolved from DB (`user_roles` → `roles.name`) as source of truth.
- Access Control nav item is shown only when `hasSection('access_control')` or `hasPermission('manage_users')`; Regulator has neither after fix.
- Backend continues to return 403 for unauthorized access; frontend avoids showing admin-only screens and shows a clean “No access” where applicable.
