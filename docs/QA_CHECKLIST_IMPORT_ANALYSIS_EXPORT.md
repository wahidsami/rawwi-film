# QA checklist — PDF import · Analysis · Report export

**Product:** Raawi Film · **Env:** note staging vs prod · **Tester:** ______ · **Date:** ______

How to use: run each row; **Pass / Fail / N/A**; paste job/script IDs and notes in the last column.

---

## Lane A — Importing PDF (upload → extract → editor)

| # | Test | Pass? | Notes (IDs, screenshots, errors) |
|---|------|-------|----------------------------------|
| A1 | Upload a **small** Arabic PDF (< 2 MB); open workspace; text matches visible PDF content (spot-check 3 places). | | |
| A2 | Upload a **large** PDF (e.g. > 10 MB if allowed); confirm no silent failure; extraction status reaches **done** or clear error. | | |
| A3 | Upload PDF with **Arabic filename** + optional **Arabic comma (،)** in name; file accepted and version row shows sensible name. | | |
| A4 | Upload **scanned / image-only** PDF; expect **clear** failure or message (not stuck forever in “extracting”). | | |
| A5 | Re-upload **new version** for same script; confirm new version number; editor loads new text. | | |
| A6 | **DOCX** path (if in scope): upload DOCX; extract and editor parity spot-check. | | |
| A7 | Open **script with many pages**; scroll/jump; page boundaries sane (no huge gaps/duplication in first/last page). | | |
| A8 | **RTL** in editor: paragraphs and mixed Arabic/Latin display acceptably. | | |
| A9 | Network **slow 3G** (DevTools throttle): upload still completes or shows timeout message (no broken half-state). | | |
| A10 | **Regulator / non-admin** allowed flows: quick-analysis or own script extract per your roles doc. | | |

---

## Lane B — Analysis time & job behavior

| # | Test | Pass? | Notes (job ID, duration, timestamps) |
|---|------|-------|--------------------------------------|
| B1 | Start analysis on **short** script (< ~5k chars); record **start → report ready** time; UI shows progress or status updates. | | |
| B2 | Start analysis on **long** script; same; no false “complete” with empty findings without explanation. | | |
| B3 | **Concurrent** jobs (2 users or 2 scripts); both finish or one queues with visible state (no deadlock). | | |
| B4 | **Failure path**: stop network mid-job or use broken payload if you have a test harness; user sees **error**, can retry. | | |
| B5 | **Re-run** analysis after script text change; new job; report reflects new content (not cached old only). | | |
| B6 | Dashboard / script card **status** matches report page (draft / running / done / failed). | | |
| B7 | **Quick analysis** (if enabled): end-to-end time acceptable vs normal script path. | | |
| B8 | Note **server time** vs **wall clock** if users report “slow” (timezone, long queue vs slow LLM). | | |

---

## Lane C — Analysis report export (PDF / print)

| # | Test | Pass? | Notes |
|---|------|-------|-------|
| C1 | From **Results** page: **Download PDF**; file opens; size **> few KB**; not blank first page only. | | |
| C2 | From **Reports** list: PDF for same report; content broadly matches on-screen summary/findings. | | |
| C3 | Report with **many findings**: PDF pagination OK; no cut-off mid-table (screenshot if fail). | | |
| C4 | Report with **zero / few** findings: PDF still valid; no crash; sections sensible. | | |
| C5 | **Arabic** in PDF: titles/snippets readable (not tofu); RTL acceptable for body text. | | |
| C6 | **Print** (browser print from report view if used): layout usable; compare to PDF export. | | |
| C7 | If download fails: user sees **toast/message** (not silent empty file). | | |
| C8 | **Quick-analysis** report PDF (if applicable): same checks as C1–C5. | | |

---

## Cross-lane sanity (one pass)

| # | Test | Pass? | Notes |
|---|------|-------|-------|
| X1 | Full path: **PDF import → extract done → start analysis → open report → download PDF** on one script. | | |
| X2 | **Audit** (if QA has access): script create / extract / version events appear after X1 (per your audit policy). | | |

---

## References (code / docs)

- Extract / PDF text: `supabase/functions/extract/`, `_shared/serverExtract.ts`
- Report PDF: `apps/web/src/components/reports/analysis/download.ts`, `Pdf.tsx`, `mapper`
- QA remediation summary: `docs/QA_REMEDIATION_REPORT.md`

---

*End of checklist.*
