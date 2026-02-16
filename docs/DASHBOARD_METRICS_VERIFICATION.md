# Dashboard metrics verification

## Root cause (fixed)

1. **RBAC filtering bug**  
   The dashboard used `created_by = uid` for non-admin users when counting scripts. So **Regulators** (and any assignee who did not create the script) saw **zero** for script counts, because they are not the creator.  
   **Fix:** Use the same visibility as GET /scripts: for non-admin, filter by `created_by = uid OR assignee_id = uid`.

2. **Status source of truth**  
   The `scripts` table has a single column `status` with CHECK values:  
   `draft`, `in_review`, `analysis_running`, `review_required`, `approved`, `rejected`.  
   There is **no** `assigned` or `completed` in the DB. The API still returns `assigned` and `completed` for the UI: `assigned` stays 0; `completed` is set to `approved + rejected` so the “Completed” chart slice reflects decided scripts.

3. **Normalization**  
   Counts use `String(status).toLowerCase()` so any casing from the DB is normalized.

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/dashboard/index.ts` | scriptsInReview and scriptsByStatus queries: for non-admin use `.or(\`created_by.eq.${uid},assignee_id.eq.${uid}\`)`. Set `scriptsByStatus.completed = approved + rejected`. Add comment for canonical status list. Optional debug log when `DEBUG_DASHBOARD=true`. |
| `apps/web/src/pages/Overview.tsx` | Subscribe to `dashboard-invalidate` and refetch stats when fired. |
| `apps/web/src/pages/ScriptWorkspace.tsx` | After `onDecisionMade`, dispatch `dashboard-invalidate` so Overview refreshes. |

## SQL verification (Supabase SQL editor)

Run as a user with access to `public.scripts`.

**1. Total scripts by status (all scripts)**

```sql
SELECT status, COUNT(*) AS cnt
FROM public.scripts
GROUP BY status
ORDER BY status;
```

**2. Scripts by status for a given user (as creator or assignee)**

Replace `'USER_UUID'` with the real user id (e.g. a Regulator).

```sql
SELECT status, COUNT(*) AS cnt
FROM public.scripts
WHERE created_by = 'USER_UUID'::uuid OR assignee_id = 'USER_UUID'::uuid
GROUP BY status
ORDER BY status;
```

**3. Expected dashboard scriptsByStatus for that user**

- `draft` … count where status = 'draft'
- `in_review` … count where status = 'in_review'
- `analysis_running` … count where status = 'analysis_running'
- `review_required` … count where status = 'review_required'
- `approved` … count where status = 'approved'
- `rejected` … count where status = 'rejected'
- `assigned` … 0 (no such status in DB)
- `completed` … approved + rejected (API sets this for the chart)

**4. scriptsInReview (pending) for that user**

Same visibility (created_by or assignee_id), status in (`draft`, `in_review`, `analysis_running`, `review_required`):

```sql
SELECT COUNT(*) AS scripts_in_review
FROM public.scripts
WHERE (created_by = 'USER_UUID'::uuid OR assignee_id = 'USER_UUID'::uuid)
  AND status IN ('draft', 'in_review', 'analysis_running', 'review_required');
```

## How the dashboard API matches

- **Admin/Super Admin:** `isUserAdmin()` is true; script queries have **no** `created_by`/`assignee_id` filter, so they count **all** scripts. The numbers should match the “Total scripts by status” query.
- **Regulator (or other non-admin):** Script queries use `.or(\`created_by.eq.${uid},assignee_id.eq.${uid}\`)`. The numbers should match the “Scripts by status for a given user” query, with `completed = approved + rejected`.

## How to verify in production

1. **Admin:** Log in as Admin, open Dashboard. Compare Approved / Rejected / Pending and the “Scripts by status” chart with the “Total scripts by status” SQL result.
2. **Regulator:** Log in as Regulator. Confirm counts are non-zero for scripts they created or are assigned to. Compare with the “Scripts by status for a given user” SQL for that user’s UUID.
3. **After decision:** As Admin or Regulator, approve or reject a script. Go back to Dashboard (or stay on Overview and trigger refetch). Approved/Rejected counts and chart should update without full page reload.

## Optional debug (Edge function)

Set env `DEBUG_DASHBOARD=true` for the dashboard Edge function. It will log one line per request with `isAdmin`, truncated `uid`, and `scriptsByStatus` (no secrets). Remove or disable in production if not needed.
