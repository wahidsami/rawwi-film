# Product backlog — Raawi

Backlog items marked **TODO (Later)**. Do not implement until prioritized.

---

## TODO (Later) #1 — Audit Log (Show All + full table)

**Context:** Dashboard has a "Recent Activity" list. Treat this as an audit preview.

### Requirements

1. Add a **"Show all"** button on the dashboard Recent Activity card.
2. Clicking **"Show all"** navigates to a new page: **/audit** (or **/activity-log**).
3. Page shows a **table of all actions** with columns:
   - **What** — action name/type
   - **Who** — user + role
   - **When** — timestamp, with timezone
   - **Target** — entity type + id/name (script / task / report / glossary / client)
   - **Result** — success/failure + message
   - **Metadata** — optional expandable JSON (e.g. old→new values)
4. **Filters:**
   - date range
   - user
   - action type
   - entity type
   - success/failure
   - search keyword (script name, client name, term)
5. **Export:**
   - CSV export
   - PDF export (optional; can be part of TODO #2)
6. **Note:** Keep report layout/UI design unchanged elsewhere; this is a new page only.

### Acceptance criteria

- Dashboard **"Show all"** opens the audit page.
- Audit table supports **pagination + filtering**.
- Every action is **traceable** (who / what / when / result).

---

## TODO (Later) #2 — PDF Report Export Suite (Arabic + English)

**Context:** Reports are critical. System should export multiple report types with a consistent "beautiful" bilingual design.

### Requirements

1. Implement a **unified PDF renderer + design system** supporting:
   - **Arabic (RTL)** and **English (LTR)**.
2. Support exporting these report types (minimum set):
   - **a)** Analysis Report — existing findings grouped by domain/article/atom; include summary charts
   - **b)** Activities/Audit Report — from TODO #1
   - **c)** Clients Report — clients list + usage stats + compliance summary
   - **d)** Glossary/Lexicon Report — terms list + severity/enforcement + last updated + coverage stats
3. Add **"Generate PDF" / "Export"** entry points:
   - Report page (analysis report)
   - Audit page (audit report)
   - Clients page (clients report)
   - Glossary page (glossary report)
4. Each PDF should include:
   - **Cover page** — logo, client, date range, language
   - **Executive summary** — KPIs
   - **Body sections** — tables + charts
   - **Appendix** — definitions, audit metadata, glossary terms as needed
   - **Footer** — page numbers + generation timestamp
5. **Nice-to-have (future):**
   - Task performance report (SLA, completion rate, time-to-review)
   - Reviewer decisions report (Mark safe/override stats, trends)
   - Script portfolio report (per client/project)
6. Keep this as **"later"**: page layouts, sections, and visuals will be defined in a separate design spec.

### Acceptance criteria

- Export button produces a **valid PDF** in AR and EN.
- **RTL/LTR** renders correctly (fonts, alignment, punctuation).
- PDFs are **consistent and brand-aligned**.

---

## TODO (Later) #3 — Audit Event Schema + Taxonomy (Foundation)

**Context:** We are treating "Recent Activity" as an audit preview and will build /audit + audit exports later. We need a consistent event schema and event taxonomy before implementing the UI/log export.

### Requirements

1. Define a **canonical AuditEvent schema** with fields:
   - **id**
   - **event_type** (enum)
   - **actor_user_id**, **actor_name**, **actor_role**
   - **occurred_at** (ISO timestamp + timezone)
   - **target_type** (script / task / report / glossary / client / etc.)
   - **target_id**, **target_label** (human readable)
   - **result_status** (success | failure)
   - **result_message** (optional)
   - **metadata** (JSON, optional; supports old→new values)
   - **request_id** / **correlation_id** (optional)
2. Define **event_type taxonomy** (initial list; extendable), grouped by area:
   - **Tasks:** TASK_CREATED, TASK_ASSIGNED, ANALYSIS_STARTED, ANALYSIS_COMPLETED, REPORT_GENERATED
   - **Findings:** FINDING_CREATED, FINDING_OVERRIDDEN, FINDING_MARKED_SAFE, FINDING_DELETED
   - **Glossary:** LEXICON_TERM_ADDED, LEXICON_TERM_UPDATED, LEXICON_TERM_DELETED
   - **Clients:** CLIENT_CREATED, CLIENT_UPDATED, CLIENT_DEACTIVATED
   - **Access:** USER_ROLE_CHANGED, LOGIN_SUCCESS, LOGIN_FAILED
3. Define **retention + access rules:**
   - retention window (propose default 180 days; configurable)
   - who can view export (admin-only by default)
   - purge policy (admin-only; audited as an event)
4. Define **export mapping requirements:**
   - Audit log table columns must be derivable from schema
   - PDF/CSV export should use the same schema fields

### Acceptance criteria

- Backlog contains TODO #3 with the above requirements and acceptance criteria.
- No code changes; documentation/backlog only.

---

*No code changes for these items until they are scheduled.*
