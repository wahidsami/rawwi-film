# Frontend Models (TypeScript interfaces & enums)

This document lists TypeScript interfaces and enums used in `apps/web/src` for API/state shapes. Source: `api/models.ts`, `api/types.ts`, `services/dashboardService.ts`, `services/activityService.ts`, and related usage. Use for alignment with backend/DB schema and API contracts.

---

## 1. Company / Client

**Source**: `api/models.ts`

```ts
export interface Company {
  companyId: string;
  nameAr: string;
  nameEn: string;
  representativeName: string;
  email: string;
  phone: string;
  createdAt: string;
  scriptsCount: number;
  avatarUrl: string;
}
```

**Used as**: API request/response for companies (clients); list and detail views; mockDb companies array.

---

## 2. User (app profile)

**Source**: `api/models.ts` (and auth store mapping from Supabase)

```ts
export enum Role {
  SuperAdmin = 'Super Admin',
  Admin = 'Admin',
  Regulator = 'Regulator'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  permissions: string[];
}
```

**Note**: Auth is Supabase; `User` in the app is mapped from Supabase user + `user_metadata` (name, role, permissions). Mock users in mockDb have the same shape (id, name, email, role, permissions).

---

## 3. Script

**Source**: `api/models.ts`

```ts
export enum ScriptStatus {
  Draft = 'Draft',
  InReview = 'In Review',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

export interface Script {
  id: string;
  companyId: string;
  title: string;
  type: 'Film' | 'Series';
  synopsis?: string;
  fileUrl?: string;
  status: ScriptStatus | string;
  createdAt: string;
  assigneeId?: string;
  currentVersionId?: string;
}
```

**Used as**: API request/response for scripts; script list and workspace; mockDb scripts.

---

## 4. ScriptVersion

**Source**: `api/models.ts`

```ts
export interface ScriptVersion {
  id: string;
  scriptId: string;
  versionNumber: number;
  source_file_name?: string;
  source_file_type?: string;
  source_file_size?: number;
  source_file_url?: string;
  extracted_text?: string;
  extraction_status: 'pending' | 'extracting' | 'done' | 'failed';
  createdAt: string;
}
```

**Used as**: Created via `scriptsApi.createVersion()`; updated by `scriptsApi.extractText()`; mockDb.scriptVersions. No dedicated GET script version list in scanned API usage.

---

## 5. Task (assignments)

**Source**: `api/models.ts`

```ts
export interface Task {
  id: string;
  scriptId: string;
  companyName: string;
  scriptTitle: string;
  status: string;
  assignedBy: string;
  assignedTo: string;
  assignedAt: string;
}
```

**Used as**: API request/response for tasks; Overview “My Queue”; mockDb tasks. Status values in UI include 'In Review', 'review_required', 'completed', 'draft', 'assigned', 'analysis_running', etc.

---

## 6. Finding

**Source**: `api/models.ts`

```ts
export enum FindingSeverity {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Critical = 'Critical'
}

export enum OverrideEventType {
  NotViolation = 'not_violation',
  HiddenFromOwner = 'hidden_from_owner'
}

export interface Finding {
  id: string;
  scriptId: string;
  source: 'manual' | 'ai' | 'lexicon_mandatory';
  excerpt: string;
  evidenceSnippet?: string;
  startOffsetGlobal?: number;
  endOffsetGlobal?: number;
  anchorHash?: string;
  location?: { page?: number; scene?: number; lineChunk?: string };
  articleId: string;
  subAtomId?: string;
  domainId?: 'A' | 'B' | 'C' | 'D' | 'E';
  titleAr?: string;
  titleEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  confidence?: number;
  severity: FindingSeverity | string;
  status: 'open' | 'accepted' | 'confirmed';
  override?: {
    eventType: OverrideEventType | string;
    reason: string;
    createdAt: string;
    byUser: string;
  };
  comments: { author: string; text: string; timestamp: string }[];
}
```

**Used as**: API request/response for findings; Results and ScriptWorkspace; FindingCard; mockDb findings. Override is embedded on the finding; API uses PUT `/findings/:id` with `{ override }`.

---

## 7. Override (embedded in Finding)

Override is not a standalone API model in the current frontend; it is a sub-object on `Finding`:

```ts
{
  eventType: 'not_violation' | 'hidden_from_owner';
  reason: string;
  createdAt: string;
  byUser: string;
}
```

**Override service** (mock) uses: `{ eventType: 'not_violation' | 'hidden_from_owner'; reason: string; byUser: string }`. The alternative overrides API (`POST/DELETE /findings/:id/override`) is defined but not used; UI updates override via `findingsApi.updateFindingOverride(id, override)` (PUT finding with override body).

---

## 8. Report (summary_json + report_html)

**Source**: `api/models.ts`

```ts
export interface Report {
  scriptId: string;
  createdAt: string;
  summaryJson: {
    decision: 'PASS' | 'REJECT' | 'REVIEW_REQUIRED';
    severityCounts: { critical: number; high: number; medium: number; low: number };
    checklistArticles: {
      articleId: string;
      titleAr: string;
      titleEn: string;
      domainId: 'A' | 'B' | 'C' | 'D' | 'E';
      status: 'ok' | 'fail' | 'warning' | 'not_scanned';
      severityCounts: { critical: number; high: number; medium: number; low: number };
    }[];
    lexiconSignals?: { term: string; context: string; severityLabel: string }[];
  };
  reportHtml: string;
}
```

**Used as**: Response of `reportsApi.getReport()` and `reportService.getReport()`; Results page state. Mock report and reportService return this shape.

---

## 9. ReportListItem (list view)

**Source**: `api/models.ts`

```ts
export interface ReportListItem {
  report_id: string;
  company_id: string;
  company_name_ar: string;
  company_name_en: string;
  script_id: string;
  script_title: string;
  script_type: 'Film' | 'Series';
  version_id?: string;
  job_id?: string;
  created_at: string;
  reviewer_user: { id: string; name: string };
  decision_status: 'PASS' | 'REJECT' | 'REVIEW_REQUIRED' | 'DRAFT';
  findings_count_total: number;
  severity_counts: { critical: number; high: number; medium: number; low: number };
  has_report_html: boolean;
}
```

**Used as**: Reports page list; built by `reportService.listReports()` (mock). No HTTP endpoint for list in current usage.

---

## 10. Lexicon term

**Source**: `api/models.ts`

```ts
export interface LexiconTerm {
  id: string;
  term: string;
  normalized_term: string;
  term_type: 'word' | 'phrase' | 'regex';
  category: 'profanity' | 'sexual' | 'violence' | 'drugs' | 'gambling' | 'blasphemy' | 'discrimination' | 'misogyny' | 'humiliation' | 'threat' | 'other';
  severity_floor: FindingSeverity | string;
  suggested_severity?: FindingSeverity | string;
  enforcement_mode: 'soft_signal' | 'mandatory_finding';
  gcam_article_id: number;
  gcam_atom_id?: string;
  gcam_article_title_ar?: string;
  description?: string;
  example_usage?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}
```

**Used as**: API request/response for lexicon terms; Glossary; mockDb lexiconTerms. Update payload includes `changed_by` and optional `change_reason` (snake_case in API: `changed_by`, `change_reason`).

---

## 11. Lexicon history

**Source**: `api/models.ts`

```ts
export interface LexiconHistoryEntry {
  id: string;
  lexicon_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data?: any;
  new_data?: any;
  changed_by: string;
  changed_at: string;
  change_reason?: string;
}
```

**Used as**: Response of `lexiconApi.getHistory(id)`; mockDb lexiconHistory. Not wired in scanned UI; dataStore has `lexiconHistory` state.

---

## 12. Job / Chunk

**Frontend**: No dedicated TypeScript interfaces for “Job” or “Chunk” in `api/models.ts`. Analysis jobs and chunks are implied by:

- Report/list items that reference `job_id`, `version_id`.
- Pipeline doc (CODE_LEVEL_PIPELINE_AND_MECHANISMS.md) and DB schema (raawi_analysis_jobs, raawi_analysis_chunks).

For API/backend alignment, job and chunk would be defined by the backend (e.g. job status, progress_total/done, chunk_index, text, offsets, status). The web app does not currently call job or chunk endpoints in the scanned code.

---

## 13. Dashboard & Activity (service types)

**Source**: `services/dashboardService.ts`, `services/activityService.ts`

```ts
// DashboardStats
interface DashboardStats {
  pendingTasks: number;
  scriptsInReview: number;
  reportsThisMonth: number;
  highCriticalFindings: number;
  scriptsByStatus: {
    draft: number;
    assigned: number;
    analysis_running: number;
    review_required: number;
    completed: number;
  };
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// Activity
interface Activity {
  id: string;
  action: string;
  actor: string;
  time: string;
  target?: string;
}
```

**Used as**: Response of GET `/dashboard/stats` and GET `/activity/recent`; Overview page.

---

## File reference

| Definition | File |
|------------|------|
| Company, Script, ScriptVersion, Task, Finding, LexiconTerm, LexiconHistoryEntry, Report, ReportListItem, Role, ScriptStatus, FindingSeverity, OverrideEventType, User | `api/models.ts` |
| Re-export of models | `api/types.ts` |
| DashboardStats, Activity | `services/dashboardService.ts`, `services/activityService.ts` |
| Data store types | `store/dataStore.ts` (re-exports from `@/api/types`) |
