# QA remediation report — handoff

**Date:** 2026-03-07  
**Scope:** Security headers, signed upload filenames, audit coverage, Scripts UX, PDF export guardrails, AI determinism note, company modal (verified).

| QA / bug ID | Topic | Status | What changed |
|-------------|--------|--------|--------------|
| **qa-sec** | Security — nginx CSP / sensitive paths | **Partial** | `apps/web/nginx.conf`: added `worker-src 'self' blob:`; comment on keeping `'unsafe-eval'` until prod verified. Existing `location` blocks already return **404** for `/.env`, `/.git`, lockfiles, etc. **Follow-up:** staged removal of `'unsafe-eval'` after bundle audit. |
| **qa-import** | Arabic / Unicode filenames (signed upload) | **Fixed** | `supabase/functions/_shared/utils.ts`: new `sanitizeUnicodeUploadFileName()` (Unicode letters/numbers, spaces, `._-،`, NFC). `supabase/functions/upload/index.ts` now uses it instead of ASCII-only `sanitizeFileName`. Aligns with `raawi-script-upload` behavior. |
| **BUG-014** | “Add script” not visible on Scripts page | **Fixed** | `apps/web/src/pages/Scripts.tsx`: header actions — **Add script** → `/clients` for Admin/Super Admin with `upload_scripts`; **Clients** CTA for users with client access who cannot upload (copy explains scripts are added from a client). |
| **BUG-015** | Audit — script / extraction events | **Fixed** | `supabase/functions/scripts/index.ts`: `logAuditCanonical` after successful **POST /scripts** (`SCRIPT_CREATED`), **POST /scripts/quick** (`SCRIPT_CREATED_QUICK`), **POST /scripts/versions** (`SCRIPT_VERSION_CREATED`). `supabase/functions/extract/index.ts`: `SCRIPT_TEXT_EXTRACTED` via `insertAuditEventMinimal` (same `audit_events` row shape; no `getUserInfo` so the **extract** bundle stays smaller for deploy). |
| **BUG-016** | PDF export empty / useless file | **Partial** | `apps/web/src/components/reports/analysis/download.ts`: rejects blobs **&lt; 500 bytes** with a clear error. `Results.tsx` / `Reports.tsx`: toasts show thrown message when short. **Follow-up:** if failures persist, debug `@react-pdf/renderer` document tree / assets (`cover.jpg`, `dashboardlogo.png`). |
| **AI-002** | Determinism (temperature) | **Verified + doc** | `supabase/functions/_shared/aiConstants.ts`: `DEFAULT_DETERMINISTIC_CONFIG.temperature` remains **0**; inline comment that worker/pipeline must pass these to the API. |
| **UX-003** | Company required fields | **Already met** | `apps/web/src/components/ClientModal.tsx`: `validateForm()` already requires **nameAr**, **nameEn**, **repName**, **phone**, **email** (with format). No code change required this session. |

## Deploy notes

- Redeploy **Edge Functions**: `upload`, `scripts`, `extract` (and any bundle that ships `_shared`).
- Rebuild/redeploy **web** image so `nginx.conf` and frontend changes apply.

## Suggested QA re-test

1. Signed URL upload with Arabic filename and Arabic comma **،** in name.
2. Create script + version; confirm **audit_events** rows for `SCRIPT_CREATED`, `SCRIPT_VERSION_CREATED`, `SCRIPT_TEXT_EXTRACTED`.
3. Scripts page: **Add script** / Clients CTA visibility by role.
4. PDF download: confirm normal report still downloads; if engine fails, user sees explicit error (not silent empty PDF).

---

*Internal todo IDs tracked in session: `qa-sec`, `qa-import`, `qa-bug14`, `qa-bug15`, `qa-bug16`, `qa-ai2`, `qa-ux3`, `qa-report`.*
