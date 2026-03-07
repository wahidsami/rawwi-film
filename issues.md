# Raawifilm — Code Audit & Issues Report

**Audit date:** 2025-03-07  
**Scope:** Full codebase — pages, components, API layer, services, stores, routing, and critical flows.

---

## Summary

| Severity | Count |
|----------|--------|
| Critical | 4 |
| High | 10 |
| Medium | 14 |
| Low / UX | 12 |

---

## 1. Critical Issues

### 1.1 Clients.tsx — Wrong hook: `useState` used instead of `useEffect` for side effect

**File:** `apps/web/src/pages/Clients.tsx` (lines 51–61)

**Issue:** A side-effect (fetching users for the creators map) is run with `useState(() => { ... })`. `useState` accepts an initial value or lazy initializer; it does not run a callback on every render or as a substitute for `useEffect`. The callback runs as the initial state function (once) and does not behave like "run when isAdmin".

**Fix:** Replace with `useEffect`:

```ts
useEffect(() => {
  if (isAdmin) {
    usersApi.getUsers()
      .then(users => {
        const map: Record<string, string> = {};
        users.forEach(u => map[u.id] = u.name);
        setCreators(map);
      })
      .catch(err => console.error('Failed to load creators:', err));
  }
}, [isAdmin]);
```

---

### 1.2 Scripts.tsx — Wrong property names: `clientId` and `c.id` (API uses `companyId`)

**File:** `apps/web/src/pages/Scripts.tsx`

**Issue:** The Script model and Company model use `companyId` (see `api/models.ts`). Scripts page uses `s.clientId` and `c.id`, which are undefined, so client name resolution and search/sort by client never work.

**Locations:**

- Lines 65–68: `companies.find(c => c.id === s.clientId)` — should use `c.companyId === s.companyId`
- Lines 78–80: same for sort by client
- Line 222: `companies.find(c => c.id === script.clientId)` — same fix

**Fix:** Use `companyId` consistently:

- Replace `s.clientId` with `s.companyId`
- Replace `c.id` with `c.companyId` when matching companies to scripts

---

### 1.3 Audit.tsx — Use of `supabase.auth.admin` in the browser

**File:** `apps/web/src/pages/Audit.tsx` (lines 66–98)

**Issue:** The code calls `supabase.auth.admin.getUserById(userId)` from the frontend. The Supabase client in the browser does not expose `auth.admin`; that API is server-only. This will throw or fail at runtime when loading the user filter dropdown.

**Fix:** Either:

- Load the list of users (and their emails/roles) from your own backend/Edge Function that uses the service role and returns safe user list, or
- Use a non-admin endpoint (e.g. a custom "list users" API that uses the service role on the server) and populate the filter from that response.

---

### 1.4 ClientDetails.tsx — Duplicate table header "Reports" / "التقارير"

**File:** `apps/web/src/pages/ClientDetails.tsx` (lines 410–415)

**Issue:** The scripts table has two consecutive `<th>` with the same label ("التقارير" / "Reports"). The second one should be "Assignee" / "المعين". The body has: Status, Reports count, Assignee, (Created By), actions — so one header is duplicated and one is missing.

**Fix:** Change the second "Reports" header (line 412) to the Assignee label (e.g. "المعين" / "Assignee") so it matches the column that shows the assignee.

---

## 2. High Priority Issues

### 2.1 Overview.tsx & export report — XSS in generated HTML

**File:** `apps/web/src/pages/Overview.tsx` (lines 162–172)

**Issue:** Activity items are interpolated into HTML with `act.action`, `act.actor`, and `act.time` without sanitization. If any of these come from the database or user input, this can lead to XSS when the report is opened/printed.

**Fix:** Sanitize or escape all values before inserting into the template (e.g. use a small escape function or the existing `sanitizeFormattedHtml`/DOMPurify where appropriate for the export context).

---

### 2.2 Clients.tsx & ClientDetails.tsx — XSS in PDF/HTML export

**Files:**  
`apps/web/src/pages/Clients.tsx` (lines 141–161),  
`apps/web/src/pages/ClientDetails.tsx` (lines 416–424),  
`apps/web/src/pages/Glossary.tsx` (lines 138–161),  
`apps/web/src/pages/Audit.tsx` (lines 226–247)

**Issue:** Client/script/glossary/audit data (names, emails, titles, metadata, etc.) are concatenated into HTML strings without escaping. Malicious or malformed data could break layout or cause XSS when the report is opened.

**Fix:** Escape all dynamic values (e.g. HTML-entity encode or use a safe template helper) before inserting into the report HTML.

---

### 2.3 Login.tsx — "Remember me" has no effect

**File:** `apps/web/src/pages/Login.tsx` (lines 101–104)

**Issue:** The "Remember me" checkbox is present but has no state or handler; it is not bound to any logic or persistence. It does nothing.

**Fix:** Either wire it to session persistence (e.g. Supabase session storage) or remove the checkbox and copy.

---

### 2.4 ProtectedRoute — Hardcoded English messages

**File:** `apps/web/src/components/ProtectedRoute.tsx` (lines 44, 63)

**Issue:** The access-denied messages "You do not have access to this section." and "You do not have the required permissions to view this page." are hardcoded in English. The rest of the UI uses `t()` and lang.

**Fix:** Use translation keys (e.g. `t('accessDeniedSection')`, `t('accessDeniedPermission')`) and add the corresponding strings to the i18n files for both languages.

---

### 2.5 ClientDetails.tsx — Unstable dependency in `loadReportCounts`

**File:** `apps/web/src/pages/ClientDetails.tsx` (lines 91–106)

**Issue:** `loadReportCounts` is memoized with `useCallback` but the dependency array uses `companyScripts.map((s) => s.id).join(',')`. That creates a new string every render, so the callback identity changes every time and the effect that depends on it re-runs unnecessarily.

**Fix:** Depend on a stable value, e.g. `companyScripts` (and ensure the effect only runs when script list actually changes), or a sorted/joined string of IDs stored in a ref so it only changes when the set of IDs changes.

---

### 2.6 ClientDetails — `handleDeleteScript` sets `setDeletingId(null)` after catch

**File:** `apps/web/src/pages/ClientDetails.tsx` (lines 111–125)

**Issue:** `setDeletingId(null)` is called in a `finally`-style position after the catch block. If the intent is "clear loading state after request ends", it would be clearer and safer to use a `finally` block so it always runs once.

**Fix:** Use `try { ... } catch { ... } finally { setDeletingId(null); }` so the loading state is always cleared.

---

### 2.7 dataStore — `updateScript` does not call the API

**File:** `apps/web/src/store/dataStore.ts` (lines 107–112)

**Issue:** `updateScript` only updates local state with `set(scripts.map(...))`. It does not call `scriptsApi.updateScript`. So any code that expects "updateScript from the store" to persist changes would be wrong. ClientDetails correctly uses `scriptsApi.updateScript` directly, but the store API is misleading.

**Fix:** Either implement `updateScript` by calling `scriptsApi.updateScript` and then updating state (or refetching), or rename/document it as "local-only" and ensure no caller relies on it for persistence.

---

### 2.8 SetPassword.tsx — Password validation inconsistent with ResetPassword

**File:** `apps/web/src/pages/SetPassword.tsx`

**Issue:** ResetPassword enforces length ≥ 8 and at least one letter and one number. SetPassword only checks length ≥ 8 and match. Validation rules should be aligned for both flows.

**Fix:** Add the same letter+number rule in SetPassword (or centralize password validation in a shared helper and use it in both pages).

---

### 2.9 Tasks.tsx — Useless try/catch and `(task as any)`

**File:** `apps/web/src/pages/Tasks.tsx` (lines 58–67, 111)

**Issue:** The row `onClick` is `async () => { try { navigate(...); } catch (e) { toast.error(...); } }`. `navigate` is synchronous and does not throw, so the catch is dead code. Also, `(task as any).assignedAt` is used for the date fallback; the task type should expose the correct field (e.g. `assignedAt` on Task, `createdAt` on AnalysisJob).

**Fix:** Use a normal `onClick={() => navigate(...)}` and type the task so the date field is correctly typed (e.g. `createdAt` vs `assignedAt`) and avoid `as any`.

---

### 2.10 Reports.tsx — Export CSV button has no handler

**File:** `apps/web/src/pages/Reports.tsx` (lines 102–105)

**Issue:** The "Export CSV" button has no `onClick` handler. Clicking it does nothing.

**Fix:** Add an `onClick` that calls a function to build and download the CSV (e.g. from `filteredReports` or `reports`), or remove the button if the feature is not implemented yet.

---

## 3. Medium Priority Issues

### 3.1 App.tsx — 404 and Certificates route

**File:** `apps/web/src/App.tsx`

**Issues:**

- The catch-all route renders a plain `<div className="p-4">Page Not Found</div>` with no layout or navigation. Prefer a dedicated NotFound component (and optionally wrap it in the same layout so the sidebar still appears).
- `/certificates` is inside the protected layout but has no `ProtectedRoute`; it is a placeholder. If certificates are optional, consider guarding it by the same permission/section as other optional features (e.g. from settings).

---

### 3.2 Overview — Possible mismatch with dashboard stats shape

**File:** `apps/web/src/pages/Overview.tsx`

**Issue:** The code uses `stats.scriptsByStatus.approved`, `rejected`, `in_review`. `DashboardStats` in `dashboardService.ts` includes these. If the backend or mock ever omits them, you get `undefined` and the UI shows "0" or NaN. Ensure the API/mock always returns these keys (even as 0).

---

### 3.3 Script status casing — Scripts page vs ClientDetails / API

**File:** `apps/web/src/pages/Scripts.tsx` vs `ClientDetails.tsx` / API

**Issue:** Scripts page filters by lowercase statuses (`'approved'`, `'rejected'`, `'draft'`, etc.). ClientDetails and Badge use PascalCase (`'Approved'`, `'Draft'`, `'In Review'`). API/models may use a different convention. Inconsistent casing can cause filters or badges to show wrong state.

**Fix:** Normalize status to one convention (e.g. from API) and use it everywhere, or map explicitly when filtering and when displaying.

---

### 3.4 Settings — Change password form non-functional

**File:** `apps/web/src/pages/Settings.tsx` (lines 114–149)

**Issue:** The "Change password" form has no state for current/new/confirm password and the submit handler only calls `e.preventDefault()`. The button does not trigger any API call or validation.

**Fix:** Add state for the three fields, validate (and optionally match ResetPassword rules), and call Supabase `updateUser({ password })` or your auth API on submit.

---

### 3.5 Settings — Role translation key

**File:** `apps/web/src/pages/Settings.tsx` (line 95), `apps/web/src/layout/AppLayout.tsx` (line 129)

**Issue:** `t(user?.role.toLowerCase().replace(' ', '') as any)` is used for role display. For "Super Admin" this becomes "superadmin". If that key is missing in the translation file, the role may not translate correctly.

**Fix:** Ensure translation keys exist for all roles (e.g. `superadmin`, `admin`, `regulator`) or use a dedicated role label map.

---

### 3.6 Glossary TermModal — Stale form when opening edit

**File:** `apps/web/src/pages/Glossary.tsx` (TermModal, lines 324–341)

**Issue:** `existingTerm` is used in the `useEffect` dependency array. It is derived from `termId` and `lexiconTerms`. If `lexiconTerms` updates after the modal opens, or if there's a timing issue, the form can show stale data.

**Fix:** Ensure the effect runs when `isOpen`, `termId`, and the resolved term (e.g. `lexiconTerms.find(t => t.id === termId)`) change, and that you reset form when `termId` or the term data changes.

---

### 3.7 Glossary — Policy article `title_en`

**File:** `apps/web/src/pages/Glossary.tsx` (line 431)

**Issue:** The code uses `(a as any).title_en` for the policy article label. If the policy map only has `title_ar`, this can be undefined. Check the shape of the policy articles and use a fallback (e.g. `Art ${a.articleId}`) if `title_en` is not present.

---

### 3.8 Audit — Pagination "Apply" does not refetch

**File:** `apps/web/src/pages/Audit.tsx` (line 368)

**Issue:** The "Apply" button only does `setPage(1)`. The list is loaded in a `useEffect` that depends on `[load]`, and `load` depends on `[page, filters]`. So changing page does trigger a refetch. But "Apply" is next to the filters; the label suggests "apply filters". If the intent is to apply filters, consider also resetting filters into state and ensuring the effect runs. If the intent is only "go to page 1", consider renaming the button to avoid confusion.

---

### 3.9 Reports — handleOpen uses report id vs jobId

**File:** `apps/web/src/pages/Reports.tsx` (line 80)

**Issue:** `handleOpen` uses `(report as any).jobId ?? (report as any).id` and `by=job` or `by=id`. If `ReportListItem` is updated to include `jobId` and `id` in the type, the `as any` can be removed. Ensure the report list API returns the field used by the Results page for loading (job vs report id).

---

### 3.10 Results.tsx — Finding review response typed as `any`

**File:** `apps/web/src/pages/Results.tsx` (line 131)

**Issue:** `findingsApi.reviewFinding(...) as any` is used to read `res.reportAggregates`. Prefer typing the API response (e.g. a dedicated type or extend the findings API return type) so the code doesn't rely on `any`.

---

### 3.11 ScriptWorkspace — Incomplete block after job completed

**File:** `apps/web/src/pages/ScriptWorkspace.tsx` (lines 128–133)

**Issue:** When `job.status === 'completed'`, there is an empty block with a comment about fetching the report id. The "View Report" flow may depend on this. Implement fetching the report id and storing it so navigation to the report works.

---

### 3.12 AppLayout — Tasks nav always hidden

**File:** `apps/web/src/layout/AppLayout.tsx` (lines 57–59)

**Issue:** The nav filter explicitly returns `false` for `link.to === '/tasks'`, so the Tasks link is never shown. If this is intentional (e.g. tasks are accessed only from Overview or elsewhere), consider documenting it; otherwise restore the Tasks link for users with the right section/permission.

---

### 3.13 ClientDetails — Table column order vs headers

**File:** `apps/web/src/pages/ClientDetails.tsx` (tbody, ~436–451)

**Issue:** The table body has: Title, Type, Date, Status, Reports (count), then another cell (Reports again in the header), then Assignee. Align thead and tbody so each column has a single clear header and the order matches (e.g. Status, Reports, Assignee, Created By (if admin), actions).

---

### 3.14 ForgotPassword / ResetPassword / SetPassword — `err: any` in catch

**Files:** Multiple auth pages

**Issue:** Several catch blocks use `err: any` and `err?.message`. Prefer `unknown` and narrow the type (e.g. `err instanceof Error ? err.message : '...'`) for safer error handling and logging.

---

## 4. Low / UX and Consistency

### 4.1 Login — Dev credentials in UI

**File:** `apps/web/src/pages/Login.tsx` (lines 121–124)

**Issue:** The info box shows default dev credentials (`admin@raawi.film` / `raawi123`). This is helpful for local dev but should not appear in production builds.

**Fix:** Show the hint only when `import.meta.env.DEV` (or your app's "is dev" flag) is true.

---

### 4.2 Overview — "Scripts in Review" card links to /clients

**File:** `apps/web/src/pages/Overview.tsx` (line 281)

**Issue:** The "Scripts in Review" KPI card button says "Open Scripts" but navigates to `/clients`. Consider navigating to `/scripts` (or the most relevant list) instead.

---

### 4.3 Clients — Pending Scripts / Approved Scripts stats hardcoded to 0

**File:** `apps/web/src/pages/Clients.tsx` (lines 272–285)

**Issue:** The "Pending Scripts" and "Approved Scripts" cards always show 0. If data is available from the API or derived from scripts, wire them; otherwise remove or label as "Coming soon".

---

### 4.4 Input — RTL and icon position

**File:** `apps/web/src/components/ui/Input.tsx` (lines 21–22, 32)

**Issue:** The icon is positioned with `start-0` and `ps-3`/`ps-10`. In RTL, "start" should flip, but the padding might need RTL-aware classes (e.g. `ps-3`/`pe-3`) so the icon stays on the correct side and text doesn't overlap.

---

### 4.5 Audit — "Previous" / "Next" not translated

**File:** `apps/web/src/pages/Audit.tsx` (lines 352–357)

**Issue:** Pagination buttons use the hardcoded strings "Previous" and "Next". Use `t('previous')` / `t('next')` (or existing keys) for consistency with the rest of the app.

---

### 4.6 AccessControl — "Manage user roles and permissions" and "Actions" not translated

**File:** `apps/web/src/pages/AccessControl.tsx` (lines 219, 265)

**Issue:** Subtitle and table header "Actions" are in English. Move to translation keys for full i18n.

---

### 4.7 dataStore — Toasts in English only

**File:** `apps/web/src/store/dataStore.ts`

**Issue:** Toasts like "Company created successfully", "Script created", "Client deleted" are hardcoded in English. Use the lang store and translation keys so toasts respect the current language.

---

### 4.8 ClientDetails — Debug console.logs

**File:** `apps/web/src/pages/ClientDetails.tsx`

**Issue:** Several `console.log` calls (e.g. DEBUG upload, assigneeId) remain in the code. Remove or guard with a dev flag before production.

---

### 4.9 Reports — "Retry" and empty state not translated

**File:** `apps/web/src/pages/Reports.tsx` (lines 212, 216)

**Issue:** "Retry" and "No reports found." are in English. Use translation keys.

---

### 4.10 Nav section vs permission — "scripts" section

**File:** `apps/web/src/layout/AppLayout.tsx` (nav link for Scripts)

**Issue:** The Scripts link uses `section: 'scripts'`. The section list in AccessControl and auth defaults use `clients`, `tasks`, `glossary`, `reports`, `access_control`, `audit` and do not include `scripts`. So access is effectively determined by `hasPermission('view_scripts')` (which maps to section `clients`). Consider either adding a `scripts` section in the backend/defaults or changing the nav to use the same section as the permission (e.g. `clients`) for consistency.

---

### 4.11 Certificate route — Placeholder content

**File:** `apps/web/src/App.tsx` (line 89)

**Issue:** `/certificates` renders a placeholder div. If the feature is not ready, consider hiding the route or nav link when the feature flag is off, and showing a proper "Coming soon" or redirect.

---

### 4.12 ResetPassword — Hash vs query params

**File:** `apps/web/src/pages/ResetPassword.tsx` (lines 21–23)

**Issue:** Token is read from `window.location.hash` (Supabase recovery flow). If Supabase is ever configured to use query params instead of hash, this will break. Document or centralize "where we read the recovery token" so it's easy to switch if needed.

---

## 5. Recommendations

1. **Security:** Consistently escape or sanitize all user- and API-sourced data before inserting into HTML (reports, exports, and any dynamic content). Use the existing DOMPurify/sanitize where applicable.
2. **i18n:** Replace remaining hardcoded English strings (errors, buttons, labels, toasts) with translation keys and add AR/EN entries.
3. **Types:** Remove `as any` where possible; add proper types for API responses (e.g. report aggregates, finding review) and use them in the UI.
4. **API consistency:** Align script status values (and any other enums) between backend, models, and frontend (filtering, display, URLs).
5. **Testing:** Add unit tests for auth store (hasPermission, hasSection), for report/export HTML escaping, and for critical flows (login, set password, invite consume).
6. **Cleanup:** Remove or gate debug logs and dev-only UI (e.g. login hints) for production builds.

---

*End of audit report.*
