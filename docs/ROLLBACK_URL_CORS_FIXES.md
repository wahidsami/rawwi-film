# Rollback: URL & CORS fixes (Feb 2026)

If something breaks after the URL/CORS changes, use this to revert.

## Option A: Revert entire change set (Git)

If you use Git and haven’t pushed yet:

```bash
# See the commit that applied these fixes
git log --oneline -1

# Revert that commit (creates a new commit that undoes it)
git revert HEAD --no-edit
```

If you already pushed, revert the specific commit:

```bash
git revert <commit-hash> --no-edit
```

## Option B: Manual rollback by area

### 1. Web app: single API_BASE_URL

**What changed:** One shared `API_BASE_URL` in `apps/web/src/lib/env.ts`; all other files import it.

**Rollback:**

- Delete `apps/web/src/lib/env.ts` (if it only exports `API_BASE_URL`).
- In each file below, add back the local constant and remove the import from `@/lib/env`:

| File | Add back this line (after other imports) |
|------|----------------------------------------|
| `apps/web/src/api/httpClient.ts` | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:54321/functions/v1';` |
| `apps/web/src/api/index.ts` | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:54321/functions/v1';` |
| `apps/web/src/pages/Results.tsx` | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:54321/functions/v1';` |
| `apps/web/src/services/glossaryService.ts` | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:54321/functions/v1';` |
| `apps/web/src/services/clientsService.ts` | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:54321/functions/v1';` |
| `apps/web/src/services/auditService.ts` | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:54321/functions/v1';` |

- In each of those files, remove any `import { API_BASE_URL } from '@/lib/env';` (or similar).

### 2. Edge Functions: localhost fallback

**What changed:** `PUBLIC_SUPABASE_URL` fallback set to `http://localhost:54321` instead of `http://127.0.0.1:54321`.

**Rollback:**

- `supabase/functions/companies/index.ts`: change fallback back to `"http://127.0.0.1:54321"`.
- `supabase/functions/upload/index.ts`: same change.

### 3. Edge Functions: CORS (optionsResponse + origin)

**What changed:** All functions call `optionsResponse(req)` and pass request origin into `jsonResponse` (via a local `json()` helper or `{ origin }`).

**Rollback:**

- In each function listed below, change `optionsResponse(req)` back to `optionsResponse()` (no argument).
- Remove the local `const origin = req.headers.get("origin") ?? undefined` and the `json()` helper that passes `{ origin }`; replace `json(...)` with `jsonResponse(...)` and remove the `{ origin }` argument from `jsonResponse` calls.

Functions: `findings`, `tasks`, `scripts`, `extract`, `invites`, `invites-consume`, `me`, `upload`, `dashboard`.

## What to test after rollback

1. **Web:** Login, open Clients, Reports, Audit, Glossary; run an analysis and open a report; export PDFs.
2. **CORS:** From app at `http://localhost:5173`, ensure no CORS errors in browser console when calling Edge Functions.
3. **Storage URLs:** Upload a company logo and open client detail; confirm image loads (no wrong host in URL).

If you only roll back one area (e.g. just web or just Edge Functions), test that area and the integration points above.
