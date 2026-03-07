# User Creation Simplification — Design & Standards

**Date:** 2026-03-07  
**Goal:** Simplify Add/Edit User to **role only** (no section toggles), without breaking the system.

---

## 1. Principle: Single source of truth

- **Role** is the single control for “what this user can do and see.”
- Backend permissions and default sidebar visibility are both derived from **role** (see `docs/PERMISSIONS_AUDIT_AND_DISCOVERY.md` §8).
- Storing a separate `allowedSections` override is optional and not exposed in the standard flow.

---

## 2. Why remove section toggles

| Before | After |
|--------|--------|
| Two controls: Role + Dashboard sections | One control: Role |
| Confusing: “Do toggles override role?” | Clear: role defines access |
| More UI, more to test, more to document | Simpler UX, fewer bugs, pro standard |

The app already supports “role-only” behavior: when `user_metadata.allowedSections` is missing or empty, the frontend uses **default sections per role** (authStore `getDefaultSectionsForRole`). So we don’t need toggles for the common case.

---

## 3. What stays the same (no breaking changes)

- **Backend:** Invite and PATCH /users still accept optional `allowedSections`. If the client doesn’t send it, we don’t set it → user gets role-based default sections. Existing users who have custom `allowedSections` in metadata keep them.
- **Frontend:** authStore still prefers `allowedSections` when present and falls back to role defaults when empty/missing. So existing users with custom sections are unchanged; new users get role defaults.
- **APIs:** No API changes. We only change the Access Control UI to stop sending `allowedSections`.

---

## 4. Implementation checklist

- [x] **Add User modal:** Collect only name, email, role. Do not send `allowedSections`.
- [x] **Edit User modal:** Collect only name, role, status. Do not send `allowedSections` (existing stored value remains).
- [x] Remove section-toggles UI and related state (`allowedSections` in form and editForm).
- [x] Keep role dropdown and helper text (“Defines backend permissions”).
- Optional later: If product needs per-user section restrictions, add an “Advanced” / “Customize visible sections” expandable section or a separate screen, and send `allowedSections` only in that path.

---

## 5. Default sections per role (reference)

Used by authStore when `allowedSections` is not set:

| Role        | Sections (sidebar) |
|------------|---------------------|
| Super Admin | clients, tasks, glossary, reports, access_control, audit |
| Admin       | clients, tasks, glossary, reports, audit |
| Regulator   | clients, reports, glossary |

No code change needed in backend or authStore for this simplification.
