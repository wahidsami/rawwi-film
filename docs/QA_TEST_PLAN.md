# RawwiFilm — End-to-End QA Test Plan

Use this document as a **checklist** for system testing. Copy the **Master checklist** table into Excel/Sheets for tracking (Pass/Fail, Notes). The sections below repeat each case with steps and checkboxes.

---

## Master checklist (Excel-friendly)

Copy the table below into Excel. Use **Pass** / **Fail** / **N/A** in the *Result* column; add date/tester in *Notes* if needed.

| ID | Module | Test case | Expected result | Result | Notes |
|----|--------|-----------|-----------------|--------|-------|
| A1 | Auth | Login with seeded user | Redirect to dashboard, no 401s | | |
| A2 | Auth | Login with wrong password | Error message, stay on login | | |
| A3 | Auth | Logout | Redirect to /login, session cleared | | |
| A4 | Auth | Protected route without login | Redirect to /login | | |
| A5 | Auth | Forgot password flow | Request email sent or clear error | | |
| O1 | Overview | Dashboard loads | Stats, activity, quick actions visible | | |
| O2 | Overview | Recent Activity "Show all" | Opens /audit (if view_audit) | | |
| C1 | Clients | List clients | Table with clients or empty state | | |
| C2 | Clients | Add new client | Modal opens, save creates client | | |
| C3 | Clients | Edit client | Changes persist, success message | | |
| C4 | Clients | Search clients | Results filter by name (AR/EN) | | |
| C5 | Clients | Export PDF (manage_companies) | PDF downloads, correct lang (AR/EN) | | |
| C6 | Clients | Client details → scripts | Navigate to client, see scripts count | | |
| S1 | Scripts | Upload script (DOCX) | File uploads, script appears in list | | |
| S2 | Scripts | Open script workspace | Editor loads, script content visible | | |
| S3 | Scripts | Start analysis | Job runs, status updates, completion | | |
| S4 | Scripts | View report after analysis | Report HTML loads, findings shown | | |
| S5 | Scripts | Manual finding: select text → Mark violation | Modal with Article/Atom, save adds finding | | |
| S6 | Scripts | Manual finding: Article 4 / 16 atoms | Atom dropdown shows 4-1..4-8, 16-1..16-5 with bible titles | | |
| R1 | Reports | List reports (by script) | Reports list loads for script | | |
| R2 | Reports | Open report HTML | Report viewer opens, sections visible | | |
| R3 | Reports | Export Analysis PDF | PDF downloads, AR/EN, RTL/LTR correct | | |
| R4 | Reports | Report finding source badges | AI / Manual / Glossary badges on cards | | |
| R5 | Reports | Report grouping & order | By article → atom → offset; no duplicate spans | | |
| G1 | Glossary | List terms | Terms table or empty state | | |
| G2 | Glossary | Add term | Modal, save creates term, no duplicate key | | |
| G3 | Glossary | Edit / deactivate term | Changes persist | | |
| G4 | Glossary | Import CSV | File upload, terms imported | | |
| G5 | Glossary | Export CSV | CSV downloads | | |
| G6 | Glossary | Export PDF (manage_glossary) | PDF downloads, filters reflected | | |
| T1 | Tasks | My Queue loads | Tasks list or empty | | |
| T2 | Tasks | Assign task (if permission) | Assignee selected, task updated | | |
| U1 | Audit | Audit page loads (view_audit) | Table, filters, pagination | | |
| U2 | Audit | Audit filters | Date, user, event type, target, result, search | | |
| U3 | Audit | Export CSV | CSV downloads for filtered set | | |
| U4 | Audit | Export PDF (view_audit) | PDF downloads, AR/EN | | |
| X1 | Access Control | Users list (manage_users) | Users table or empty | | |
| X2 | Access Control | Add user / invite | Invite flow or add user works | | |
| X3 | Access Control | Role/permission visibility | Roles match RBAC seed | | |
| Y1 | Settings | Settings page loads | Tabs: Profile, Platform, etc. | | |
| Y2 | Settings | Change language (AR/EN) | UI and report lang switch | | |
| Y3 | Settings | Save platform settings (if permission) | Success message, no error | | |
| L1 | Localisation | Arabic UI | RTL layout, Arabic labels | | |
| L2 | Localisation | English UI | LTR layout, English labels | | |
| L3 | Localisation | PDF language follows app | Export PDF matches current lang | | |

---

## 1. Authentication

### A1 — Login with seeded user
- [ ] Open `/login`, enter `admin@raawi.film` / `raawi123`
- [ ] Submit; expect redirect to dashboard (or `from` path)
- [ ] No 401 in console; sidebar and overview load

### A2 — Login with wrong password
- [ ] Enter valid email, wrong password
- [ ] Error message shown (invalid credentials / sign up hint)
- [ ] Stay on login page

### A3 — Logout
- [ ] From any authenticated page, click Logout / تسجيل الخروج
- [ ] Redirect to `/login`; session cleared (reload still shows login)

### A4 — Protected route without login
- [ ] Logout or open app in incognito; go to `/clients` or `/reports`
- [ ] Redirect to `/login` (or login page shown)

### A5 — Forgot password
- [ ] On login, click Forgot password; enter email
- [ ] Either success message or clear error (local may not send email)

---

## 2. Overview / Dashboard

### O1 — Dashboard loads
- [ ] After login, Overview shows: stats cards, Recent Activity, Quick Actions
- [ ] No console errors; numbers may be 0 if empty DB

### O2 — Recent Activity "Show all"
- [ ] If user has `view_audit`, "Show all" opens `/audit`
- [ ] Otherwise link may go to tasks or audit preview per design

---

## 3. Clients (Companies)

### C1 — List clients
- [ ] Go to Clients; table shows existing clients or empty state
- [ ] Columns: name (AR/EN), scripts count, actions

### C2 — Add new client
- [ ] Click Add New Client; modal opens
- [ ] Fill name (AR/EN), save; client appears in list, success message

### C3 — Edit client
- [ ] Open edit for a client; change name or fields
- [ ] Save; list updates, success message

### C4 — Search clients
- [ ] Type in search; list filters by company name (Arabic or English)

### C5 — Export PDF (manage_companies)
- [ ] As user with `manage_companies`, click Export PDF
- [ ] PDF downloads: `clients-report-<date>-ar.pdf` or `-en.pdf`
- [ ] Content: title, generated at, clients table; RTL for AR, LTR for EN

### C6 — Client details → scripts
- [ ] Open a client; see details and scripts count / link to scripts

---

## 4. Scripts & Analysis

### S1 — Upload script (DOCX)
- [ ] From Clients or Scripts, upload a .docx file
- [ ] Script appears in list; no upload error

### S2 — Open script workspace
- [ ] Open a script; workspace loads with editor and script content
- [ ] No CORS or 401 on workspace/report APIs

### S3 — Start analysis
- [ ] In workspace, start analysis (button or flow)
- [ ] Job status updates (e.g. running → completed); no worker errors if worker is running

### S4 — View report after analysis
- [ ] When analysis completes, open report (by job or script)
- [ ] Report HTML loads; findings section shows cards (or empty)

### S5 — Manual finding: select text → Mark violation
- [ ] In workspace, select text; open "Mark as Violation" / تسجيل ملاحظة يدوية
- [ ] Modal: Article (and optional Atom); save
- [ ] New finding appears in report with Manual source badge

### S6 — Manual finding: Article 4 / 16 atoms
- [ ] In manual finding modal, select Article 4; Atom dropdown shows 4-1..4-8 with Arabic titles from bible
- [ ] Select Article 16; Atom dropdown shows 16-1..16-5 with bible titles

---

## 5. Reports

### R1 — List reports (by script)
- [ ] From Reports or script context, list reports for a script
- [ ] List loads (or empty); no CORS error

### R2 — Open report HTML
- [ ] Open a report; HTML viewer shows sections (summary, violations, etc.)

### R3 — Export Analysis PDF
- [ ] On report page, click Export PDF
- [ ] PDF downloads: `analysis-report-<jobId-prefix>-<date>-ar.pdf` or `-en.pdf`
- [ ] Arabic: RTL, Cairo font when available; English: LTR

### R4 — Report finding source badges
- [ ] Report with AI finding → badge "تحليل آلي" / "AI Analysis"
- [ ] Report with manual finding → "ملاحظة يدوية" / "Manual Note"
- [ ] Report with lexicon match → "مطابقة قاموس" / "Glossary Match"

### R5 — Report grouping & order
- [ ] Findings grouped by article (PolicyMap order), then atom, then offset
- [ ] No duplicate rows for same span+atom+source

---

## 6. Glossary / Lexicon

### G1 — List terms
- [ ] Open Glossary; table shows terms or empty state
- [ ] Filters: search, category, severity, enforcement mode

### G2 — Add term
- [ ] Click Add Term; modal opens; fill term, type, severity, etc.
- [ ] Save; term appears; duplicate term shows clear error

### G3 — Edit / deactivate term
- [ ] Edit a term; save; changes persist
- [ ] Deactivate (if supported); term state updates

### G4 — Import CSV
- [ ] If feature enabled, Import CSV; choose file; terms imported (or clear error)

### G5 — Export CSV
- [ ] Export CSV; file downloads with current filter

### G6 — Export PDF (manage_glossary)
- [ ] As user with `manage_glossary`, Export PDF
- [ ] PDF downloads; filters reflected; AR/EN and RTL/LTR correct

---

## 7. Tasks

### T1 — My Queue loads
- [ ] Open Tasks / My Queue; list loads or empty state

### T2 — Assign task
- [ ] If user has assign_tasks, assign a task to a user; task updates

---

## 8. Audit Log

### U1 — Audit page loads (view_audit)
- [ ] As user with `view_audit`, open /audit
- [ ] Table with columns: What, Who, When, Target, Result; pagination

### U2 — Audit filters
- [ ] Use filters: date range, user, event type, target type, result, search
- [ ] Table updates accordingly

### U3 — Export CSV
- [ ] Export CSV; file downloads for current filtered set

### U4 — Export PDF (view_audit)
- [ ] Export PDF; `audit-report-<date>-ar.pdf` or `-en.pdf`; content matches filters

---

## 9. Access Control

### X1 — Users list (manage_users)
- [ ] As user with `manage_users`, open Access Control
- [ ] Users table or empty; no 403

### X2 — Add user / invite
- [ ] Add user or send invite (if implemented); flow completes or clear error

### X3 — Role/permission visibility
- [ ] Roles (Admin, Super Admin, Regulator) and permissions match RBAC seed

---

## 10. Settings

### Y1 — Settings page loads
- [ ] Open Settings; tabs/sections load (Profile, Platform, Branding, etc.)

### Y2 — Change language (AR/EN)
- [ ] Switch language; UI labels and report language switch

### Y3 — Save platform settings
- [ ] Change a setting (if permitted), save; success message, no error

---

## 11. Localisation & PDFs

### L1 — Arabic UI
- [ ] Switch to Arabic; layout RTL; labels in Arabic

### L2 — English UI
- [ ] Switch to English; layout LTR; labels in English

### L3 — PDF language follows app
- [ ] Set app to Arabic; export any PDF; filename and content Arabic (RTL)
- [ ] Set app to English; export; filename and content English (LTR)

---

## Quick reference — Permissions

| Permission | Typical role | Allows |
|------------|--------------|--------|
| manage_companies | Admin, Super Admin | Clients CRUD, Clients PDF |
| manage_glossary | Admin, Super Admin, Regulator | Glossary CRUD, Glossary PDF, Import/Export CSV |
| view_audit | Admin, Super Admin | Audit page, Audit CSV/PDF |
| manage_users | Super Admin (and Admin per seed) | Access Control, users/invites |
| view_reports | All | View reports list and report HTML |
| assign_tasks | Admin, Super Admin | Assign tasks |
| upload_scripts, run_analysis, override_findings, generate_reports | Per role | Script upload, run analysis, override, generate report |

---

**Tester:** _______________  
**Date:** _______________  
**Build / branch:** _______________  
**Environment:** Local (Supabase + Edge Functions + Worker + Web)
