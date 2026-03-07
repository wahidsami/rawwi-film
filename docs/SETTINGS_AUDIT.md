# Settings Page — Audit (What Works vs What’s Not Applied)

**Date:** 2026-03-07  
**Scope:** Settings tabs and whether values are used app-wide or only stored.

---

## 1. Working (saved and effective)

| Area | Control | Status |
|------|--------|--------|
| **Account** | Profile (name, email, role) | Read-only from auth; displays correctly. |
| **Account** | Preferred language | Displayed (Select disabled); app language is controlled by langStore/toggle elsewhere. |
| **Account** | Change password | Uses `supabase.auth.updateUser({ password })` — works. |
| **Account** | Sign out | Logout + navigate to login — works. |
| **All admin tabs** | Every input/switch | Values are saved to **settingsStore** (persisted to localStorage under `raawi-settings`). So saving works. |

---

## 2. Applied (wired to the app)

These values are read from `useSettingsStore()` and affect behavior as follows:

| Tab | Control | Where applied |
|-----|--------|----------------|
| **Platform** | Default language | `App.tsx`: on first load (no `raawi-lang-initialized`), lang is set from `settings.platform.defaultLanguage`. |
| **Platform** | Default report mode | `Reports.tsx`: opening a report uses `standalone` → `window.open(..., '_blank')`, else in-app navigate. |
| **Platform** | Date format | `utils/dateFormat.ts` + consumers: Reports, Results, ReportLayout, AnalysisReportPdf, Overview, Glossary, ClientDetails, Clients, Audit, Scripts, Tasks, FindingCard, RecentDecisionsWidget, ScriptWorkspace. |
| **Platform** | Create version on file replace | `ClientDetails.tsx`: formData `createVersion` sent to upload; `raawi-script-upload` Edge function skips version creation and extraction when `createVersion` is false. |
| **Platform** | Require reason on overrides | `Results.tsx`: review modal requires non-empty reason when `requireOverrideReason` is true; submit button disabled accordingly. |
| **Security** | Session timeout (minutes) | `AppLayout.tsx`: idle timer on mousedown/keydown/scroll/touchstart; logout after N minutes. Disabled when 0 or missing. |
| **Branding** | Org name, logo URL, footer notes, show decision badge | `AnalysisReportPdf.tsx`, `ReportLayout.tsx`: optional branding props; `Results.tsx` HTML print replacements. Decision badge in PDF gated by `showDecisionBadge`. |
| **Features** | Enable Lexicon CSV | `Glossary.tsx`: Import CSV and Export CSV buttons hidden when `enableLexiconCsv` is false. |
| **Features** | Enable Certificates | `AppLayout.tsx`: Certificates nav link and route `/certificates` (placeholder page) shown when `enableCertificates` is true. |
| **Features** | Enable Hidden overrides | `FindingCard.tsx`: hidden-from-owner strip, badge, and opacity only shown when `enableHiddenOverrides` is true. |

---

## 3. Not applied (deferred)

| Tab | Control | Note |
|-----|--------|------|
| **Security** | Audit log retention days | Backend: configure retention separately (e.g. cron or Edge function reading server config). |
| **Security** | Force re-login | Not implemented; could be a flag that clears session on next load. |
| **Security** | Password policy | Description only in Settings; no client-side enforcement. |

---

## 4. Summary

- **Working:** Account tab (profile, change password, sign out); all Settings persist to localStorage.
- **Applied:** Platform (report mode, date format, default language, create version on replace, require reason), Security (session timeout), Branding (report PDF/print), Features (Lexicon CSV, Certificates nav, Hidden overrides) are wired and in use.
- **Deferred:** Audit log retention, force re-login (document only).
