# Route Audit (BUG-06 – Incorrect 404 Routing)

## Summary

Scan of frontend routes, navigation targets, and backend API paths to find broken or misconfigured routes.

## Frontend routes (App.tsx)

| Path | Component | Notes |
|------|-----------|--------|
| `/login` | Login | |
| `/forgot-password` | ForgotPassword | |
| `/reset-password` | ResetPassword | |
| `/set-password` | SetPassword | |
| `/` | Overview | Index |
| `/access-control` | AccessControl | |
| `/glossary` | Glossary | |
| `/clients` | Clients | |
| `/clients/:id` | ClientDetails | |
| `/tasks` | Tasks | |
| `/scripts` | Scripts | |
| `/quick-analysis` | QuickAnalysis | When `ENABLE_QUICK_ANALYSIS` |
| `/scripts/:id/workspace` | ScriptWorkspace | |
| `/workspace/:id` | ScriptWorkspace | Same component |
| `/report/:id` | Results | Report view |
| `/reports` | Reports | Report list |
| `/audit` | Audit | |
| `/certificates` | Certificates | |
| `/settings` | Settings | |
| `*` | NotFound | Catch-all |

All navigation targets in the app (`navigate(...)`, `<Link to="...">`) use the above paths; no broken frontend links found.

## Backend (Supabase Edge Functions)

Base URL: `VITE_API_BASE_URL` or `https://<project>.supabase.co/functions/v1`

| Path / Function | Purpose |
|-----------------|---------|
| `GET /me` | Current user (auth store) |
| `GET/POST/PUT/DELETE /companies` | Companies CRUD |
| `GET/POST/PATCH/DELETE /scripts`, `/scripts/quick`, `/scripts/:id`, etc. | Scripts |
| `GET/POST /tasks`, `GET /tasks?jobId=`, `GET /tasks?jobId=&chunks=true` | Tasks / jobs |
| `GET/POST/PUT /findings`, `/findings?jobId=`, `/findings?reportId=` | Findings |
| `GET/POST/PUT/DELETE /reports`, `GET /reports?id=`, `?jobId=`, `?scriptId=` | Reports CRUD |
| `GET /activity/recent` | Activity feed |
| `GET /dashboard/stats`, `GET /dashboard/recent-decisions` | Dashboard |
| `GET/POST/PATCH/DELETE /users`, `POST /invites`, `POST /invites-consume` | Users / invites |
| `GET/POST/PATCH /notifications` | Notifications |
| `GET/POST /audit`, `GET /audit/export` | Audit |
| `POST /upload`, `POST /extract` | Upload / extract |
| `POST /raawi-script-upload` | Script upload (ClientDetails) |
| `GET/POST/PUT /lexicon/terms`, `GET /lexicon/history/:id` | Glossary |

**Removed / deprecated (BUG-06 fix):**

- `GET /reports/audit.pdf` → **410 Gone** (PDF export moved to client-side; frontend shows in-app message).
- `GET /reports/glossary.pdf` → **410 Gone** (same).
- `GET /reports/clients.pdf` → **410 Gone** (same).

Unknown subpaths under `/reports` (e.g. `/reports/unknown`) now return **404 Not Found** instead of being treated as “list reports”.

## Static assets

Templates under `apps/web/public/templates/` are requested with relative URLs (e.g. `/templates/report-template.html`) and are served by the app; no backend route.

## Auth

- Login uses **Supabase Auth** (`signInWithPassword`), not `POST /auth/login`. The `authApi.login` and mock `POST /auth/login` exist for legacy/mock only; no `auth` Edge function in production.
