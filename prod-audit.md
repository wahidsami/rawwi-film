# Production Readiness Audit Report - RaawiFilm

## 1. Localhost & Environment Hygiene
| File | Finding | Status | Action |
| --- | --- | --- | --- |
| `apps/web/src/lib/env.ts` | Fallback to `localhost:54321` exists | [!] Risky | Add production guard to prevent accidental use |
| `supabase/functions/_shared/cors.ts` | `localhost:5173` in allowed list | [~] Minor | Keep for dev, ensure `APP_PUBLIC_URL` is used in prod |
| `supabase/functions/upload/index.ts` | Defaulting to `localhost:54321` | [!] Risky | Strict require `PUBLIC_SUPABASE_URL` in cloud |

## 2. Runtime Stability (Frontend)
| Component | Finding | Status | Action |
| --- | --- | --- | --- |
| `CompanyAvatar.tsx` | Calls `toPublicStorageUrl` (Undefined) | [X] CRITICAL | Rename to `resolveStorageUrl` |
| `ClientDetails.tsx` | Direct `import.meta.env` usage | [~] Improved | Use centralized `API_BASE_URL` |

## 3. Docker & Deployment
| Service | Finding | Status | Action |
| --- | --- | --- | --- |
| `apps/web` | Missing `.dockerignore` | [!] Risky | Create `.dockerignore` |
| `apps/worker` | Missing `.dockerignore` | [!] Risky | Create `.dockerignore` |
| `apps/worker` | `PolicyMap.json` loading | [OK] Fixed | Robust resolution with env var fallback |

## 4. Database URL Hygiene
| Table | Finding | Status | Action |
| --- | --- | --- | --- |
| `clients` | Absolute URLs found | [OK] Fixed | Convert to relative paths via Migration |
| `scripts` | Absolute URLs found | [OK] Fixed | Convert to relative paths via Migration |
| `script_versions` | Absolute URLs found | [OK] Fixed | Convert to relative paths via Migration |

---

## Next Steps
- Implement PR with minimal surgical changes.
- Push to GitHub for deployment.
- Verify no localhost leaks in production bundle.
