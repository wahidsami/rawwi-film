# Production Readiness & Stabilization Plan

This plan addresses production failures related to `localhost` leaks, missing Docker files, and runtime JS crashes.

## Proposed Changes

### 1. Environment & Localhost Hygiene

#### [MODIFY] [cors.ts](file:///d:/Waheed/MypProjects/RawwiFilm/supabase/functions/_shared/cors.ts)
- Guard `ALLOWED_ORIGINS` to be used only if not in production or if explicitly requested.
- Ensure `APP_PUBLIC_URL` is the primary source of truth in production.

#### [MODIFY] [env.ts](file:///d:/Waheed/MypProjects/RawwiFilm/apps/web/src/lib/env.ts)
- Standardize the `API_BASE_URL` logic.

#### [MODIFY] [upload/index.ts](file:///d:/Waheed/MypProjects/RawwiFilm/supabase/functions/upload/index.ts)
- Tighten the fallback logic for `PUBLIC_SUPABASE_URL`.

### 2. Runtime Crash Fixes

#### [MODIFY] [CompanyAvatar.tsx](file:///d:/Waheed/MypProjects/RawwiFilm/apps/web/src/components/ui/CompanyAvatar.tsx)
- Fix the `toPublicStorageUrl` is not defined error by correctly using `resolveStorageUrl`.

#### [MODIFY] [ClientDetails.tsx](file:///d:/Waheed/MypProjects/RawwiFilm/apps/web/src/pages/ClientDetails.tsx)
- Replace direct `import.meta.env.VITE_SUPABASE_URL` usage with the centralized `API_BASE_URL` logic.

### 3. Docker & Deployment Correctness

#### [NEW] [.dockerignore](file:///d:/Waheed/MypProjects/RawwiFilm/apps/web/.dockerignore)
- Add standard exclusions (node_modules, .git, .env).

#### [NEW] [.dockerignore](file:///d:/Waheed/MypProjects/RawwiFilm/apps/worker/.dockerignore)
- Add standard exclusions. Ensure `PolicyMap.json` is **NOT** ignored.

### 4. Database Normalization

#### [MODIFY] [20260215120000_fix_logo_urls.sql](file:///d:/Waheed/MypProjects/RawwiFilm/supabase/migrations/20260215120000_fix_logo_urls.sql)
- Ensure the migration is robust for all tables: `clients`, `scripts`, `script_versions`.

## Verification Plan

### Automated Tests
- `cd apps/web && pnpm build`: Verify frontend builds correctly without runtime reference errors.
- `grep -r "localhost:54321" apps/web/dist`: Verify no leaks in the built bundle.

### Manual Verification
- Run a smoke test on the `/clients` page to ensure logos load and no console errors appear.
- Verify worker starts up in a simulated Docker environment or check logs for path resolution.
