# API Contract (apps/web)

This document lists every network call used by the frontend: endpoint path, method, auth, request/response shapes, call sites, and mock assumptions. Base URL when not using mock: `https://api.arena.com/v1`. All requests use `Content-Type: application/json` unless noted.

**Auth**: When `USE_MOCK_API` is false, `httpClient` sends `Authorization: Bearer <token>` using the Supabase session `access_token`. No auth is sent for mock mode.

---

## 1. Auth

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/auth/login` | POST | No | `{ "email": string, "password": string }` | `{ "token": string, "user": object }` | **Not used** (auth is Supabase; `authApi.login` exists but Login page uses `useAuthStore().login` → Supabase) |

**Note**: Login is handled by Supabase Auth in the app. The `/auth/login` mock route remains in `httpClient` for legacy/mock-only scenarios.

---

## 2. Companies (Clients)

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/companies` | GET | Yes (Bearer) | — | `Company[]` | `store/dataStore.ts` → `fetchInitialData()` |
| `/companies` | POST | Yes | `Company` (see frontend-models) | `Company` | `store/dataStore.ts` → `addCompany()` |
| `/companies/:id` | PUT | Yes | `Partial<Company>` | `Company` | `store/dataStore.ts` → `updateCompany()` |

**Query params**: None.  
**Assumptions**: List returns all companies; no pagination. ID in PUT is `companyId` (e.g. `COMP-001`).

---

## 3. Scripts

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/scripts` | GET | Yes | — | `Script[]` | `store/dataStore.ts` → `fetchInitialData()` |
| `/scripts` | POST | Yes | `Script` | `Script` | `store/dataStore.ts` → `addScript()` |
| `/scripts/versions` | POST | Yes | `{ scriptId: string, source_file_name?: string, source_file_type?: string, source_file_size?: number, extraction_status?: string }` | `ScriptVersion`-like `{ id, versionNumber, createdAt, ... }` | `pages/ScriptWorkspace.tsx` → `handleFileUpload()` via `scriptsApi.createVersion()` |
| `/upload` | POST | Yes | `{ "fileName": string }` | `{ "url": string }` (e.g. blob URL) | `pages/ScriptWorkspace.tsx` → `handleFileUpload()` via `scriptsApi.uploadFile(file)` |
| `/extract` | POST | Yes | `{ "versionId": string, "text"?: string }` | Updated version object (e.g. `extracted_text`, `extraction_status: "done"`) | `pages/ScriptWorkspace.tsx` → `handleFileUpload()` via `scriptsApi.extractText()` |

**Query params**: None.  
**Assumptions**: Upload currently sends only `fileName` (no multipart file body). Script list is full list; no pagination. Version create returns an object with `id`; script is updated client-side with `currentVersionId` via `updateScript()` (no dedicated PATCH script endpoint called).

---

## 4. Tasks (Assignments)

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/tasks` | GET | Yes | — | `Task[]` | `store/dataStore.ts` → `fetchInitialData()` |
| `/tasks` | POST | Yes | `Task` | `Task` | `store/dataStore.ts` → `addTask()` |

**Query params**: None.  
**Assumptions**: Full list; no pagination or filter by assignee (filtering is client-side, e.g. Overview “My Queue” by `assignedTo === user?.id`).

---

## 5. Findings

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/findings` | GET | Yes | — | `Finding[]` | `store/dataStore.ts` → `fetchInitialData()` |
| `/findings` | POST | Yes | `Finding` | `Finding` | `store/dataStore.ts` → `addFinding()` |
| `/findings/:id` | PUT | Yes | `{ status?, comment?, author?, override? }` (partial) | `Finding` | `store/dataStore.ts` → `updateFindingStatus()` (status, comment, author) and `updateFindingOverride()` (override) |

**Query params**: None.  
**Assumptions**: List is full; no filter by script (filtering by `scriptId` in Results/ScriptWorkspace). Override is sent as part of PUT body `{ override }`; `undefined`/omit to revert. **Alternative override endpoints** (defined but not used): `POST /findings/:id/override`, `DELETE /findings/:id/override` (`overridesApi`); UI uses only `findingsApi.updateFindingOverride` (PUT).

---

## 6. Lexicon

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/lexicon/terms` | GET | Yes | — | `LexiconTerm[]` | `store/dataStore.ts` → `fetchInitialData()`, `importLexiconTerms()` (refresh after import) |
| `/lexicon/terms` | POST | Yes | `LexiconTerm` | `LexiconTerm` | `store/dataStore.ts` → `addLexiconTerm()`, `importLexiconTerms()` (per term) |
| `/lexicon/terms/:id` | PUT | Yes | `{ ...Partial<LexiconTerm>, changed_by: string, change_reason?: string }` or `{ is_active: false, changed_by, change_reason? }` | `LexiconTerm` | `store/dataStore.ts` → `updateLexiconTerm()`, `deactivateLexiconTerm()` |
| `/lexicon/history/:id` | GET | Yes | — | `LexiconHistoryEntry[]` | Used by Glossary (if any component calls `lexiconApi.getHistory(id)`); not present in current grep call sites (dataStore has `lexiconHistory` state but no fetcher in scanned files) |

**Query params**: None.  
**Assumptions**: Terms list is full; no pagination. History is per-term by lexicon term `id`.

---

## 7. Reports

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/reports/get` | POST | Yes | `{ "scriptId"?: string, "jobId"?: string }` | `Report` (scriptId, createdAt, summaryJson, reportHtml) | **Defined in** `api/index.ts` as `reportsApi.getReport()`. **Not used** by UI: `pages/Results.tsx` and `pages/Reports.tsx` use `reportService.getReport()` / `reportService.listReports()` (in-memory mock only). |

**Query params**: None.  
**Assumptions**: Either `scriptId` or `jobId` identifies the report. Response shape must match `Report` (see frontend-models.md).

---

## 8. Users

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/users` | GET | Yes | — | `any[]` | **Not used** in scanned components (exported in `api/index.ts` only). |
| `/users` | POST | Yes | `any` (user object) | `any` | **Not used** in scanned components. |

**Assumptions**: Likely for Access Control / user management; no call sites found in apps/web/src.

---

## 9. Dashboard & Activity (services)

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/dashboard/stats` | GET | Yes | — | `DashboardStats` (see below) | `services/dashboardService.ts` → `getOverviewStats()`; consumed by `pages/Overview.tsx` in `fetchDashboard()` |
| `/activity/recent` | GET | Yes | — | `Activity[]` (see below) | `services/activityService.ts` → `listRecent()`; consumed by `pages/Overview.tsx` in `fetchDashboard()` |

**DashboardStats (mock/response shape)**  
- `pendingTasks: number`  
- `scriptsInReview: number`  
- `reportsThisMonth: number`  
- `highCriticalFindings: number`  
- `scriptsByStatus: { draft, assigned, analysis_running, review_required, completed: number }`  
- `findingsBySeverity: { critical, high, medium, low: number }`

**Activity (mock/response shape)**  
- `id: string`  
- `action: string`  
- `actor: string`  
- `time: string`  
- `target?: string`

**Query params**: None.  
**Assumptions**: Stats are global (no company/script filter). Activity is a single “recent” list; no pagination.

---

## 10. Override (alternative API — not used in UI)

| Endpoint | Method | Auth | Request body | Response | Called from |
|----------|--------|------|--------------|----------|-------------|
| `/findings/:findingId/override` | POST | Yes | Override payload (e.g. eventType, reason, byUser) | — | **Not used**; `overrideService.setOverride()` is mock-only (no HTTP). |
| `/findings/:findingId/override` | DELETE | Yes | — | — | **Not used**; `overrideService.revertOverride()` is mock-only. |

Override flow in the app uses **PUT `/findings/:id`** with body `{ override }` via `findingsApi.updateFindingOverride()`.

---

## Mock-only services (no HTTP in use)

- **reportService** (`services/reportService.ts`): `listReports()`, `getReport()`, `generateReportHtml()` — all return mock data with `setTimeout`; no `reportsApi` or `httpClient` calls.
- **overrideService** (`services/overrideService.ts`): `setOverride()`, `revertOverride()` — resolve after delay; no `overridesApi` or `httpClient` calls.

---

## Summary: API layer files

| File | Role |
|------|------|
| `api/httpClient.ts` | Single HTTP client: `get`, `post`, `put`, `delete`; when not mock, adds Bearer from Supabase session; contains full mock router for all paths above. |
| `api/index.ts` | Re-exports `authApi`, `companiesApi`, `scriptsApi`, `tasksApi`, `findingsApi`, `lexiconApi`, `reportsApi`, `usersApi`, `overridesApi`. |
| `api/mockDb.ts` | In-memory store for mock data (companies, scripts, tasks, findings, lexiconTerms, lexiconHistory, users, scriptVersions). |
| `api/models.ts` | Types only (no network). |
| `api/types.ts` | Re-exports `api/models`. |
| `services/activityService.ts` | Calls `httpClient.get('/activity/recent')`. |
| `services/dashboardService.ts` | Calls `httpClient.get('/dashboard/stats')`. |
| `services/reportService.ts` | Mock only; no HTTP. |
| `services/overrideService.ts` | Mock only; no HTTP. |

---

## Mock service shapes (for DB/backend alignment)

These shapes are used in mock state or mock responses; backend/DB schema should align where applicable.

- **companies**: `Company` (companyId, nameAr, nameEn, representativeName, email, phone, createdAt, scriptsCount, avatarUrl).
- **scripts**: `Script` (id, companyId, title, type, synopsis?, fileUrl?, status, createdAt, assigneeId?, currentVersionId?).
- **scriptVersions** (mockDb): array of version-like objects with `id`, `versionNumber`, `extracted_text`, `extraction_status`, `createdAt`, plus optional source file fields.
- **tasks**: `Task` (id, scriptId, companyName, scriptTitle, status, assignedBy, assignedTo, assignedAt).
- **findings**: `Finding` (id, scriptId, source, excerpt, evidenceSnippet, articleId, subAtomId, domainId, titleAr, titleEn, descriptionAr, severity, status, confidence, location, override, comments).
- **lexiconTerms**: `LexiconTerm` (id, term, normalized_term, term_type, category, severity_floor, enforcement_mode, gcam_article_id, etc.; see frontend-models).
- **lexiconHistory**: `LexiconHistoryEntry[]` (id, lexicon_id, operation, old_data, new_data, changed_by, changed_at, change_reason).
- **users** (mockDb): `{ id, name, email, role, permissions: string[] }`.
- **DashboardStats**: see §9 above.
- **Activity**: see §9 above.
- **Report**: see frontend-models.md (summaryJson + reportHtml).
- **ReportListItem**: list view item (report_id, company_id, script_id, script_title, decision_status, findings_count_total, severity_counts, has_report_html, etc.).
