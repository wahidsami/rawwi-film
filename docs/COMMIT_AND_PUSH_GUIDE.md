# What to commit and push — Phases 1–4 + error handling

Use this as a checklist before you commit and push. Deploy steps (Supabase, Edge) are at the end.

---

## 1. Files to commit (all phases + error handling)

### Phase 1 — Arabic font & DOCX
- `apps/web/index.html` — Amiri font link
- `apps/web/src/pages/ScriptWorkspace.tsx` — Arabic font + `lang` on script viewer

### Phase 2 — Script pages (schema, extract, API, client)
- `supabase/migrations/0025_script_pages.sql` — table `script_pages`
- `supabase/functions/extract/index.ts` — accept `pages[]`, write `script_pages`, build full content
- `supabase/functions/scripts/index.ts` — GET editor returns `pages` with `startOffsetGlobal`
- `apps/web/src/utils/documentExtract.ts` — `extractTextFromPdfPerPage`, `extractTextFromPdf` uses it
- `apps/web/src/api/index.ts` — `extractText` options `pages`, `EditorPageResponse`, `EditorContentResponse.pages`
- `apps/web/src/pages/ScriptWorkspace.tsx` — PDF import sends `pages` to extract

### Phase 3 — Page-based workspace UI
- `apps/web/src/pages/ScriptWorkspace.tsx` — page state, toolbar (page nav + zoom), current-page viewer, page-scoped highlights

### Phase 4 — Finding page number & report “Page X”
- `supabase/migrations/0026_analysis_findings_page_number.sql` — column `page_number` on `analysis_findings`
- `supabase/functions/findings/index.ts` — `FINDING_COLS` + `camelFinding` include `page_number`; manual insert sets `page_number` from `script_pages`
- `apps/web/src/api/index.ts` — `AnalysisFinding.pageNumber`
- `apps/web/src/components/reports/analysis/mapper.ts` — `AnalysisPdfFinding.pageNumber`, map from API/canonical
- `apps/web/src/components/reports/analysis/Pdf.tsx` — show “Page X” / “صفحة X” when `pageNumber` is set

### Error handling — No script card when import fails
- `apps/web/src/pages/QuickAnalysis.tsx` — on upload/extract error: delete script, refresh history, no card
- `apps/web/src/pages/ClientDetails.tsx` — on upload/extract error when adding script with document: delete script, return early, no card/task/navigate

### Docs / tracker
- `docs/PLAN_SCRIPT_PAGES_AND_FORMATTING.md` — design (existing)
- `docs/IMPLEMENTATION_TRACKER_SCRIPT_PAGES.md` — checkboxes updated (existing)
- `docs/COMMIT_AND_PUSH_GUIDE.md` — this file

---

## 2. Git commands

```bash
# From repo root: d:\Waheed\MypProjects\Raawifilm fix

# Stage all changed/new files
git add apps/web/index.html
git add apps/web/src/pages/ScriptWorkspace.tsx
git add apps/web/src/pages/QuickAnalysis.tsx
git add apps/web/src/pages/ClientDetails.tsx
git add apps/web/src/utils/documentExtract.ts
git add apps/web/src/api/index.ts
git add apps/web/src/components/reports/analysis/mapper.ts
git add apps/web/src/components/reports/analysis/Pdf.tsx
git add supabase/migrations/0025_script_pages.sql
git add supabase/migrations/0026_analysis_findings_page_number.sql
git add supabase/functions/extract/index.ts
git add supabase/functions/scripts/index.ts
git add supabase/functions/findings/index.ts
git add docs/IMPLEMENTATION_TRACKER_SCRIPT_PAGES.md
git add docs/COMMIT_AND_PUSH_GUIDE.md

# Commit
git commit -m "feat: script pages (PDF), page-based workspace, Phase 4 page_number, import error handling

- Phase 1: Arabic font (Amiri) + lang on script viewer
- Phase 2: script_pages table, extract accepts pages[], GET editor returns pages; client PDF per-page extract + send pages
- Phase 3: Page state, toolbar (page/zoom), current-page viewer, highlights per page
- Phase 4: analysis_findings.page_number, manual finding sets page, report shows Page X
- Error handling: Quick Analysis and Add script (client) delete script on import/extract failure so no empty card"

# Push
git push
```

Or stage everything and commit in one go:

```bash
git add -A
git status   # review
git commit -m "feat: script pages, page-based workspace, finding page number, import error handling"
git push
```

---

## 3. After push — deploy steps

### 3.1 Database migrations

Run migrations so `script_pages` and `analysis_findings.page_number` exist:

- **Local:** `supabase db push` or `supabase migration up`
- **Hosted (Supabase Dashboard):** run the two new migrations, or link the project and run `supabase db push`

### 3.2 Edge functions

Deploy the updated Edge functions:

```bash
supabase functions deploy extract
supabase functions deploy scripts
supabase functions deploy findings
```

(Use your Supabase project ref if required, e.g. `--project-ref your-ref`.)

### 3.3 Web app

Build and deploy the frontend as you usually do (e.g. Vite build, then deploy to Coolify / your host). No extra env or config needed for these changes.

---

## 4. Quick verification

- **Quick Analysis:** Upload a PDF → script card appears only after successful extract; on failure, no card and error toast.
- **Client — Add script with document:** Add script + file; on upload/extract failure, script is removed and no card.
- **Script workspace (PDF):** After importing a PDF, toolbar shows “Page 1 / N”, zoom and prev/next work; highlights only on current page.
- **Report:** Run analysis on a script that has pages; open report → findings show “Page X” when `page_number` is set (e.g. manual findings on that version).
- **DOCX / no pages:** Existing DOCX and single-page flow unchanged; no toolbar when there are no pages.
