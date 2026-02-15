# Verification — PolicyMap taxonomy & source badges

---

## 0) Audit Log MVP (optional)

**Location:** Dashboard → Recent Activity card → "Show all" → `/audit` (admin-only). Sidebar: "Audit Log" (when user has `view_audit`).

| Step | What to verify |
|------|----------------|
| 1 | Dashboard "Show all" opens `/audit`. |
| 2 | Audit table shows columns: What, Who, When (timezone), Target, Result, Metadata (expandable). |
| 3 | Filters: date range, user, event type, target type, success/failure, search keyword. |
| 4 | Pagination works (page size 20, Previous/Next). |
| 5 | "Export CSV" downloads a CSV for the current filtered set. |
| 6 | Recent Activity (dashboard) shows real audit events when user has `view_audit`; otherwise falls back to analysis jobs. |

**Sample audit event (API response item, camelCase):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "eventType": "CLIENT_CREATED",
  "actorUserId": "usr-123",
  "actorName": "Admin",
  "actorRole": "admin",
  "occurredAt": "2025-02-09T12:00:00.000Z",
  "targetType": "client",
  "targetId": "comp-456",
  "targetLabel": "شركة مسامير",
  "resultStatus": "success",
  "resultMessage": null,
  "metadata": { "after": { "companyId": "comp-456", "nameAr": "شركة مسامير" } },
  "requestId": null,
  "correlationId": null,
  "createdAt": "2025-02-09T12:00:00.000Z"
}
```

**Events recorded:** TASK_CREATED, ANALYSIS_STARTED, ANALYSIS_COMPLETED, FINDING_MARKED_SAFE, FINDING_OVERRIDDEN, LEXICON_TERM_ADDED/UPDATED/DELETED, CLIENT_CREATED/UPDATED (USER_ROLE_CHANGED, LOGIN_SUCCESS/FAILED optional later). Retention default 180 days; view/export admin-only (`view_audit`).

---

## 0.4) Audit Log PDF export (AR/EN)

**Location:** `/audit` page → **"Export PDF"** button (next to "Export CSV"). Admin-only (same `view_audit` as audit list/CSV).

| Step | What to verify |
|------|----------------|
| 1 | As a user with `view_audit`, open `/audit`. |
| 2 | Set filters if desired (date range, event type, target type, result status, search). |
| 3 | Click **"Export PDF"** (or "تصدير PDF" in AR). Button shows loading state; PDF downloads. |
| 4 | Filename format: `audit-report-<date>-ar.pdf` or `audit-report-<date>-en.pdf` (lang follows app language). |
| 5 | **Arabic:** App in Arabic → Export PDF. Confirm PDF is **RTL**, right-aligned; Arabic uses Cairo font when fonts are present. |
| 6 | **English:** App in English → Export PDF. Confirm PDF is **LTR**, left-aligned. |
| 7 | PDF content (v1): cover (Audit Log Report + date range + generated at); Filter summary section (applied filters); KPI summary (total events, success vs failure, top 5 event types, top 5 actors); Events table (What, Who, When, Target, Result). |
| 8 | **Admin-only:** As a user without `view_audit`, calling `GET /reports/audit.pdf` (e.g. from another tab or API) returns **403 Forbidden**. |

**API:** `GET /reports/audit.pdf?lang=ar|en&dateFrom=&dateTo=&eventType=&targetType=&resultStatus=&q=` (auth + `view_audit` required). Returns `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="audit-report-<date>-<lang>.pdf"`.

**Checklist:** RTL/LTR and filters (date, event type, target, result, search) are reflected in the PDF. Same filtering logic as `/audit` list and CSV export.

---

## 0.48) Glossary / Lexicon PDF export (AR/EN)

**Location:** Glossary page (`/glossary`) → **"Export PDF"** button (next to Import CSV and Export CSV). Same permission as Glossary page access (`manage_glossary`).

| Step | What to verify |
|------|----------------|
| 1 | As a user with `manage_glossary`, open `/glossary`. |
| 2 | Optionally set filters: search, category, severity, enforcement mode (the page shows active terms only by default). |
| 3 | Click **"Export PDF"** (or "تصدير PDF" in AR). Button shows loading state; PDF downloads. |
| 4 | Filename format: `glossary-report-<date>-ar.pdf` or `glossary-report-<date>-en.pdf` (lang follows app language). |
| 5 | **Arabic:** App in Arabic → Export PDF. Confirm PDF is **RTL**, right-aligned; Arabic uses **Cairo** font when fonts are present in `_shared/fonts/` and VFS is built. |
| 6 | **English:** App in English → Export PDF. Confirm PDF is **LTR**, left-aligned. |
| 7 | PDF content: cover ("تقرير المعجم" / "Glossary Report" + optional client + generated at); Executive summary KPIs (total terms, active vs inactive, by enforcement mode, by severity); Terms table (Term, Type, Mode, Severity, Active, Updated); Appendix with definitions of term_type and enforcement_mode. |
| 8 | **Filters reflected:** When filters are applied (e.g. mode=mandatory_finding, severity=high, q=search), the PDF contains only terms matching those filters. |

**API:** `GET /reports/glossary.pdf?lang=ar|en&clientId=&isActive=&mode=&severity=&q=` (auth + `manage_glossary` required). Returns `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="glossary-report-<date>-<lang>.pdf"`.

**Checklist:** RTL/LTR; filters (isActive, mode, severity, q) reflected in PDF; Cairo used for Arabic when available.

---

## 0.47) Clients PDF export (AR/EN) — v1 complete

**Location:** Clients (Companies) page (`/clients`) → **"Export PDF"** button (next to Add New Client / other actions). Same permission as Clients page access: `manage_companies`.

**v1 scope:** Report shows only real data. No placeholder "—" fields, no Active/Inactive (clients table has no `is_active`), no Last Activity or Findings columns.

| Step | What to verify |
|------|----------------|
| 1 | As a user with `manage_companies`, open `/clients`. |
| 2 | Optionally set search (`q`) and/or date range (`dateFrom`, `dateTo`) via API or UI if present. |
| 3 | Click **"Export PDF"** (or "تصدير PDF" in AR). Button shows loading state; PDF downloads. |
| 4 | Filename format: `clients-report-<date>-ar.pdf` or `clients-report-<date>-en.pdf` (lang follows app language). |
| 5 | **RTL/LTR:** Arabic PDF is right-aligned (RTL); English PDF is left-aligned (LTR). |
| 6 | **Cairo:** When Cairo fonts are present in `_shared/fonts/` and VFS is built, Arabic PDF uses Cairo font. |
| 7 | **Real fields only:** PDF contains: cover (title + generated at + optional date range); Executive summary: Total clients (+ Total scripts when > 0); Clients table: **Client** (name by lang) | **Created** | **Updated** | **Scripts** (when any client has scripts). Appendix: period/date range definition only. No Status, Last Activity, or Findings. |
| 8 | **Filters reflected:** When `q` or `dateFrom`/`dateTo` are passed, the PDF contains only clients matching those filters. |
| 9 | **Permission enforcement:** As a user without `manage_companies`, calling `GET /reports/clients.pdf` returns **403 Forbidden**. |

**API:** `GET /reports/clients.pdf?lang=ar|en&q=&dateFrom=&dateTo=` (auth + `manage_companies` required). Returns `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="clients-report-<date>-<lang>.pdf"`. No `isActive` param (ignored/removed).

**Checklist:** Report shows only real fields; no placeholders; RTL/LTR; Cairo when fonts exist; filters (q, date range) reflected; permission enforced. Feature closed for v1.

---

## 0.5) Analysis Report PDF export (AR/EN)

**Location:** Report/Results page → "Export PDF" button (next to Export HTML and Print). No change to existing report UI layout.

| Step | What to verify |
|------|----------------|
| 1 | Open any report (e.g. `/report/<jobId>` or `/report/<id>?by=job`). |
| 2 | Click **"Export PDF"** (or "تصدير PDF" in AR). Button shows loading state then triggers download. |
| 3 | PDF downloads with filename like `analysis-report-<jobId-prefix>-<date>-ar.pdf` or `...-en.pdf`. |
| 4 | **Arabic:** Switch app language to Arabic, click Export PDF. Confirm filename ends with `-ar.pdf` and that the PDF content uses **RTL** (right-aligned text) and **Cairo font** for Arabic. |
| 5 | **English:** Switch to English, Export PDF. Confirm filename ends with `-en.pdf` and content is **LTR** (left-aligned). |
| 6 | Open the PDF: cover page shows report title, client, script, report date, generated-at timestamp. |
| 7 | Executive summary shows totals and severity counts; checklist/domain table if present. |
| 8 | Findings section shows domain → article → finding cards (source badge, severity, confidence, evidence; "Safe" if present). |
| 9 | Appendix shows short definitions (AI / Manual / Glossary). |

**API:** `GET /reports/analysis.pdf?jobId=<uuid>&lang=ar|en` (auth required). Returns `application/pdf` with `Content-Disposition: attachment`.

**RTL/LTR checklist:** Arabic PDF: body and tables right-aligned. English PDF: left-aligned. Header: page/total; footer: generation time.

**Fonts & offline:** Arabic PDF uses **Cairo** font when font files are present in `supabase/functions/_shared/fonts/` (run `node scripts/build-pdf-vfs.mjs` after adding Cairo-Regular.ttf and Cairo-Bold.ttf). PDF generation uses **local pdfmake** (no esm.sh or other runtime network import). **Offline-safe PDF generation** once dependencies and fonts are bundled.

---

## 1) Source badge on finding cards

**Location:** Report page → Violations section → any finding card. The source label appears in the card header (same row as title and severity).

| # | Label (AR)    | Proof |
|---|---------------|--------|
| a | تحليل آلي     | **[Screenshot 1a]** Finding from AI analysis: open a report that has at least one AI finding; card header must show badge "تحليل آلي". |
| b | ملاحظة يدوية  | **[Screenshot 1b]** Add a manual finding (Script → select text → "Mark as Violation" → save); open Report; card must show "ملاحظة يدوية". |
| c | مطابقة قاموس  | **[Screenshot 1c]** Report that has at least one lexicon-mandatory match; card must show "مطابقة قاموس". |

**If screenshots not possible — reproduction:**

- **Route:** `/reports` → pick report by job/script → scroll to "المخالفات" / Violations.
- **1a:** Ensure job had AI analysis run; one finding with `source: "ai"` → badge "تحليل آلي".
- **1b:** Script workspace → select text → "تسجيل ملاحظة يدوية" / "Mark as Violation" → choose report, article, save → open that report → badge "ملاحظة يدوية".
- **1c:** Job with lexicon mandatory term matched → badge "مطابقة قاموس".
- **Console:** In DevTools → Network → GET `/findings?jobId=...` → Response: each object has `source` (`"ai"` \| `"manual"` \| `"lexicon_mandatory"`). Match to badge text above.

---

## 2) PolicyMap atoms in manual finding modal (titles = bible)

**Location:** Script workspace → "Mark as Violation" / "تسجيل ملاحظة يدوية" modal → Article dropdown → Atom (optional) dropdown.

| # | Requirement | Proof |
|---|-------------|--------|
| a | Article 4 atoms: 4-1 .. 4-8, titles match bible | **[Screenshot 2a]** In modal, select Article "Art 4 - ضوابط المحتوى الإعلامي…". Atom dropdown must list 4-1..4-8 with Arabic titles from bible (e.g. 4-1 "الإخلال بالذوق العام أو الآداب العامة", 4-8 "عدم الالتزام بالتصنيف العمري"). |
| b | Article 16 atoms: 16-1 .. 16-5, titles match bible | **[Screenshot 2b]** Select Article "Art 16 - الشائعات والمعلومات المضللة". Atom dropdown must list 16-1..16-5 with bible titles (e.g. 16-1 "تقديم معلومات مغلوطة أو غير دقيقة على أنها حقائق", 16-5 "غياب التمييز بين الخيال والواقع"). |

**If screenshots not possible — reproduction:**

- **Route:** `/scripts/:scriptId` (Script workspace) → run analysis and have a report → select text in editor → click "تسجيل ملاحظة يدوية" / "Mark as Violation".
- **2a:** Article = "Art 4 - …" → Atom dropdown: 4-1..4-8 with labels matching `docs/bible_taxonomy.json` article 4 atoms.
- **2b:** Article = "Art 16 - …" → Atom dropdown: 16-1..16-5 with labels matching bible article 16.
- **Console/Network:** GET `/findings?jobId=...` → each finding’s `titleAr` (or report summary `top_findings[].title_ar`) should match PolicyMap/bible for that `atomId`.

---

## 3) API/network JSON snippet (finding object)

**Endpoint:** `GET /functions/v1/findings?jobId=<uuid>`

**Example response item (camelCase):**

```json
{
  "articleId": 16,
  "atomId": "16-3",
  "source": "ai",
  "startOffsetGlobal": 1240,
  "endOffsetGlobal": 1280,
  "evidenceSnippet": "نص الدليل المقتطع من السيناريو"
}
```

(Other fields returned: `id`, `jobId`, `scriptId`, `versionId`, `severity`, `confidence`, `titleAr`, `descriptionAr`, `startLineChunk`, `endLineChunk`, `location`, `createdAt`, `reviewStatus`, `reviewReason`, etc.)

---

## 4) Results report — PolicyMap titles, order, dedupe

- **Group labels (atom titles):** Report "المخالفات" section shows article and atom titles from PolicyMap (patched from bible). Card title or group label for a finding must match `PolicyMap.json` (and thus `bible_taxonomy.json`) for that `articleId`/`atomId`.
- **Sorting:** Unchanged: Article (PolicyMap order) → then atom numeric (e.g. 5-1, 5-2) → then `startOffsetGlobal`. No layout change.
- **Dedupe:** Same source + article + atom + span + snippet → one finding (highest severity kept). No repeated rows for the same span+atom+source.

**Reproduction:** Open any report with findings → `/reports` (by job or script) → Violations. Check one finding: note `articleId` and `atomId`, then confirm `titleAr` (or summary payload) equals `PolicyMap.json` for that article’s atom. Order: articles 5 then 8 then …; within an article, findings ordered by atom id then offset. Duplicate (same span+atom+source) must not appear twice.

---

## 5) Checklist

| Item | Status |
|------|--------|
| Report layout unchanged | ✅ |
| Group labels (atom titles) reflect updated PolicyMap / bible | ✅ |
| Grouping order: PolicyMap article asc → atom numeric → startOffsetGlobal | ✅ |
| Dedupe: no repeated same source+article+atom+span | ✅ |
| Article 25 not generated by analysis | ✅ |
| Article 26 never appears | ✅ |
| Manual modal: Article 4 and 16 atom titles match bible | ✅ (verify in UI) |

---

**How to confirm checklist (if needed):**

- **Layout:** Report page sections and card design unchanged; only taxonomy text (titles) and order from PolicyMap.
- **Titles:** PolicyMap.json was patched from bible_taxonomy.json; worker and web load it. Manual dropdown and report labels use same source.
- **Order:** "المخالفات" grouped by domain then article (PolicyMap order); within article, by atom id then offset.
- **Dedupe:** Aggregation uses key `source|articleId|atomId|start-end|hash(snippet)`; one finding per key.
- **Article 25/26:** Scannable list is 1–24; 25 admin-only, 26 out-of-scope.
