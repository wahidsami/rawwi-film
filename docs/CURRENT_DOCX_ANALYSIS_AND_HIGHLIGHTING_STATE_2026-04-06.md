# Current DOCX Analysis And Highlighting State

## Purpose

This document explains the **current end-to-end DOCX analysis flow** in Raawi, with emphasis on:

- how a DOCX is imported
- how text is extracted and stored
- what exact text is sent to AI
- how findings come back and are transformed into cards
- what the workspace viewer is rendering
- how the system currently tries to highlight findings
- why page jump may work while exact visual highlight still fails

This is intended to help a consultant understand the system as it exists today, not as originally intended.

---

## Executive Summary

For `DOCX`, the system does **not** analyze the original binary Word document directly.

Instead, the current pipeline is:

1. user uploads a DOCX
2. client-side code extracts page/text/HTML representations
3. backend stores extracted page text and normalized canonical text
4. AI analyzes the **extracted normalized text**, not the original DOCX file
5. worker produces raw findings
6. aggregation produces:
   - raw DB findings
   - report summary JSON
   - unified reviewer-facing rows
7. Results page, Workspace cards, and exports now prefer the **unified review layer**
8. workspace highlighting tries to resolve each finding back into the extracted page text

Current high-level status:

- report page is now loading and counts are consistent
- workspace cards are now loading from the unified review layer
- review actions and reanalysis persistence are materially improved
- clicked-finding highlighting in DOCX is now materially working again in the workspace

Observed current state from workspace:

- cards can jump to the correct page
- the clicked finding text can now visibly render with strong emphasis inside the page viewer
- page-boundary cases where the finding spans two pages are also handled more safely than before

This means the core workflow is significantly improved, and the most trust-sensitive workspace behavior has been recovered. Some edge-case anchoring quality work may still remain, but the main “click card -> see the text” path is no longer the same blocker it was before.

---

## Shared Architecture

There are two user entry paths:

- `Client / Company script flow`
- `Quick Analysis flow`

These used to drift historically, but the current recovery work intentionally moved both paths onto the same downstream review model wherever possible.

Today, the intended shared layers are:

- extraction
- script text persistence
- page persistence
- analysis job creation
- worker analysis
- review-layer materialization
- Results page
- Workspace cards
- exports

The main metadata difference is ownership/context:

- client flow is associated with a real client/company
- quick analysis can be stored under an internal/quick-analysis context

But the analysis/review pipeline is intended to be the same.

---

## Source Of Truth Layers

The system currently has three important layers of finding data:

### 1. Raw findings

Table:

- `analysis_findings`

Purpose:

- raw machine/manual detection rows
- lower-level evidence records
- historically used directly by workspace and report logic

### 2. Report snapshot

Table:

- `analysis_reports`

Important payload:

- `summary_json`
- `summary_json.canonical_findings`
- `summary_json.report_hints`

Purpose:

- saved report snapshot
- printable/exportable aggregate summary
- historical reporting

### 3. Unified review layer

Table:

- `analysis_review_findings`

Purpose:

- one persisted reviewer-facing row per visible finding card
- intended current source for:
  - Results cards
  - Workspace cards
  - review state
  - safe/violation status
  - manual findings
  - edited classification
  - reanalysis carry-forward

Current direction of the system:

- `analysis_findings` remains the raw detection layer
- `analysis_reports.summary_json` remains the saved report snapshot/export layer
- `analysis_review_findings` is the new reviewer truth layer

---

## DOCX Import Flow

## Frontend import

Main frontend utilities and pages:

- [documentExtract.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/utils/documentExtract.ts)
- [QuickAnalysis.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/QuickAnalysis.tsx)
- [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

Client-side DOCX extraction uses:

- `mammoth`
- `JSZip`

What the frontend tries to get from DOCX:

- plain text
- HTML
- page-aware text when possible

Important implementation notes:

- `mammoth.extractRawText(...)` is used for plain text
- `mammoth.convertToHtml(...)` is used for HTML/formatted rendering
- OOXML is read with `JSZip` to detect page breaks from:
  - `w:br type="page"`
  - `w:lastRenderedPageBreak`

If true Word page breaks exist:

- the workspace can use page slices closer to the original document pagination

If page breaks do not exist:

- the system heuristically subdivides extracted content into print-like chunks/pages

So for DOCX, “page” is sometimes:

- real Word page-break-based page
- and sometimes a heuristic extracted page slice

This is important because highlight anchoring is page-based.

---

## Backend Extract Flow

Main backend extract entry:

- [extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts)

Supporting persistence:

- [scriptEditor.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/_shared/scriptEditor.ts)

For DOCX, `/extract` receives extracted client-side page data and/or HTML/plain text, then:

1. normalizes text
2. creates/stores `script_pages`
3. stores canonical full text in `script_text.content`
4. stores optional formatted HTML in `script_text.content_html`
5. updates `script_versions.extracted_text`

Important detail:

- `script_text.content` is the canonical text used for analysis-sensitive offsets
- `script_text.content_html` is a formatted companion for viewing, not the core analysis truth

Relevant tables:

- `script_versions`
- `script_pages`
- `script_text`
- `script_sections`

---

## What Exactly Is Sent To AI?

For DOCX, the AI does **not** analyze the original `.docx` binary file.

The AI analyzes the **normalized extracted text**, ultimately based on:

- `script_text.content`

This canonical content is derived from the extracted/imported text flow.

In other words:

- original DOCX file: input artifact
- extracted text/pages: operational analysis source
- canonical normalized text: final AI analysis source

This is a major architectural fact:

- AI sees the **extracted representation**
- not the original visual Word layout

That is why any mismatch between:

- extracted page text
- formatted HTML view
- or user’s expectation of the original Word appearance

can directly affect highlight accuracy.

---

## Analysis Job Creation

Main backend task entry:

- [tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)

Main worker pipeline:

- [pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts)
- [aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

When the user starts Smart Analysis:

1. frontend calls `scriptsApi.createTask(...)`
2. backend creates `analysis_jobs`
3. chunks are built from canonical text
4. worker processes chunks
5. raw findings are written
6. worker aggregates them into report/review layers

Important backend design note:

- tasks/job creation uses canonical extracted text, not the original Word file

---

## How Findings Come Back

The worker returns findings in stages.

### A. Raw findings

Written into:

- `analysis_findings`

These include fields like:

- article
- atom
- severity
- evidence snippet
- offsets
- page number
- anchor fields

### B. Report summary

Written into:

- `analysis_reports.summary_json`

Important report payloads:

- `canonical_findings`
- `report_hints`
- totals and counts

### C. Unified review rows

Materialized into:

- `analysis_review_findings`

These rows are now intended to become the user-facing finding cards.

They store reviewer-facing state like:

- source kind
- evidence snippet
- article / atom / severity
- review status
- anchor offsets
- anchor text
- manual comment
- edited state
- safe/violation status

---

## How Cards Are Made Today

### Results page

Main file:

- [Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)

Current behavior:

- Results now prefers `analysis_review_findings`
- fallback to older summary/raw layers still exists where needed

This is why counts/cards are now materially better than before.

### Workspace findings tab

Main file:

- [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

Current behavior:

- workspace cards now prefer `analysis_review_findings`
- raw `analysis_findings` are still used for some linkage and actions
- some actions still depend on successful linkage to raw rows

This is why the UI now shows messages like:

- `تُعرض هذه البطاقات الآن من طبقة المراجعة الموحدة`

This message is technically accurate:

- visible cards are now review-layer-first
- but some legacy action/highlight plumbing still depends on raw-linked data quality

---

## Viewer Technology

### DOCX / extracted text view

Main viewer surface:

- [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

For DOCX, the workspace primarily uses:

- extracted page text
- optional extracted HTML
- DOM text indexing for HTML mode

Key internal mechanisms:

- `buildDomTextIndex(...)`
- plain-text segmentation/highlighting
- per-page content rendering

### PDF original viewer

Main component:

- [PdfOriginalViewer.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/script/PdfOriginalViewer.tsx)

Libraries:

- `pdfjs-dist`

Purpose:

- render the original PDF visually
- this is mainly for visual fidelity, not the primary exact analysis surface

### Export rendering

Libraries:

- `@react-pdf/renderer`
- `JSZip`

Main export files:

- [download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/download.ts)
- [downloadWord.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/downloadWord.ts)
- [download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/quick-analysis/download.ts)

Exports now prefer the unified review layer where available.

---

## Highlighting Mechanism In The Workspace

This is the most important section for the consultant.

### Goal

When the user clicks a finding card:

1. move to the correct page
2. highlight the exact word/sentence

### Current strategy

Main file:

- [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

Important functions:

- `resolveFindingViaStoredPageData(...)`
- `resolveFindingViaWorkspaceSearch(...)`
- `resolveFindingViaStrictWorkspaceSearch(...)`
- `resolveFindingSpanInText(...)`
- `locateFindingInContent(...)`
- `applyHighlightMarks(...)`
- `handlePinFindingInScript(...)`

### Inputs used for resolution

For each finding, the system tries to use:

- `anchorPageNumber`
- `anchorStartOffsetPage`
- `anchorEndOffsetPage`
- `anchorStartOffsetGlobal`
- `anchorEndOffsetGlobal`
- `anchorText`
- `evidenceSnippet`
- page content from `script_pages`

### Resolution order, conceptually

For DOCX strict mode, the system tries roughly this order:

1. use stored page number + stored page offsets
2. strict exact search on stored page text
3. page-scoped evidence search
4. wider workspace search across joined extracted pages
5. if still unresolved:
   - jump to page if known
   - mark as needing manual verification

### Rendering modes

There are two broad rendering situations:

1. plain text / extracted page rendering
2. formatted HTML rendering

In formatted HTML rendering, the system builds a DOM text index and tries to wrap the corresponding DOM range with a highlight span.

That is much harder than plain string highlighting because:

- text may be split across many DOM nodes
- punctuation/quotes/line breaks may differ
- visible text and underlying HTML can drift

### Current user-facing coverage messaging

The workspace currently reports coverage like:

- `تغطية التمييز: 9 من 12`

Meaning:

- 12 findings are visible in the findings tab
- 9 could be resolved visually into highlight targets
- 3 could not be resolved precisely enough to draw a trusted highlight

That message is not cosmetic; it reflects the actual current state of the resolver.

### Resolved root cause

The final blocker turned out not to be only matching logic.

The system was often correctly:

- finding the right page
- computing the right local span
- building the correct matching segment in memory

But the visible highlight still disappeared because cleanup logic in:

- [domTextIndex.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/utils/domTextIndex.ts)

was unwrapping **all** elements with `data-finding-id`.

That unintentionally removed the declarative page-text highlight spans rendered by:

- [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

So the system could “know exactly where the finding is” and still show nothing visually.

The effective fix was:

1. force the clicked finding through a dedicated page-text render path
2. preserve local page spans for pinned findings
3. support overlap rendering when a finding crosses a page boundary
4. restrict cleanup so it only unwraps imperatively injected HTML-mode marks, not declarative page-text spans

That was the missing piece that made the visible workspace highlighting start working again.

---

## Why Page Jump Can Work But Highlight Still Fail

This is the current critical behavior gap.

A card may still jump to the correct page while not highlighting the exact text because page navigation and exact sentence anchoring are not the same task.

Page navigation can succeed using:

- stored page number
- or approximate page mapping from global offsets

But exact highlight can still fail if:

1. the stored offsets are stale or not exact enough
2. the evidence snippet differs from page text after normalization
3. the phrase occurs more than once on the same page
4. punctuation/quotes differ
5. extracted HTML/view text differs from canonical analyzed text
6. the page resolver finds the page but not a unique exact span inside it

So:

- page hit success != anchor hit success

---

## Why Some Findings Say “Not Found” Even Though The Text Is On The Page

Current likely causes:

### 1. Same page, wrong local span

The system knows the page, but:

- `anchorStartOffsetPage` / `anchorEndOffsetPage` are not trustworthy enough
- strict page exact search fails
- page-scoped search still misses the exact occurrence

### 2. Duplicate phrase problem

If a word/phrase appears multiple times:

- the current resolver may not know which occurrence is the real one

### 3. Canonical-vs-view mismatch

AI analyzed normalized extracted text, but the viewer can still render:

- page content
- formatted HTML
- or a structure that differs slightly in visible spacing/punctuation

### 4. Weak evidence snippet

If the evidence snippet is short or generic, exact resolution becomes harder.

### 5. DOM rendering complexity

In formatted HTML mode:

- the sentence can be visually continuous
- but technically fragmented across DOM nodes

The resolver may know the text is “there”, but fail to build a valid DOM range for it.

---

## Current Known Strengths

After the recent recovery work, the system is materially better in these areas:

- report page loads correctly
- counts are now more consistent
- workspace cards are visible again
- review actions are more consistent
- review state is carried across reanalysis more reliably
- exports are aligned better with the review layer
- client flow and quick analysis are closer to using the same review architecture

---

## Current Known Weaknesses

Immediate:

- some edge-case DOCX anchors may still need refinement
- duplicate-phrase disambiguation on the same page can still be improved
- AI rationale quality remains a separate problem from visible highlighting

Secondary:

- AI rationale quality is still uneven
- some “why considered a violation” explanations are not sufficiently specific or useful

The user explicitly identified the immediate priorities as:

1. highlight findings in the document
2. reduce “not found” cases when the text is actually present

That prioritization is reasonable and matches the current technical state.

---

## Current Consultant-Facing Diagnosis

The system is no longer mainly suffering from “missing report data” or “broken counts”.

Those areas have been substantially repaired by introducing the unified review layer.

The main remaining DOCX trust problem is now:

- **edge-case finding-to-text anchoring quality, not the basic visible highlight path itself**

In plain language:

- the review system now knows **what findings exist**
- and it can now visually paint clicked findings in the workspace again
- but some harder anchoring cases may still deserve follow-up refinement

That means the product is no longer failing at the most trust-sensitive basic click-to-highlight behavior, even though some precision improvements remain worth doing.

---

## Technologies Involved

### Frontend

- React
- Vite
- TypeScript

### DOCX extraction

- `mammoth`
- `JSZip`

### PDF viewing

- `pdfjs-dist`

### PDF export

- `@react-pdf/renderer`

### Word export

- `JSZip`

### Backend / storage / auth / DB

- Supabase
- Supabase Edge Functions
- Postgres tables for:
  - scripts
  - versions
  - pages
  - text
  - findings
  - review findings
  - reports

### AI analysis

- worker-based chunked analysis pipeline
- OpenAI-backed judgment/routing pipeline in worker code

---

## Important Files

### Import / extraction

- [documentExtract.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/utils/documentExtract.ts)
- [extract/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/extract/index.ts)
- [scriptEditor.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/_shared/scriptEditor.ts)

### Analysis / worker

- [tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts)
- [pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts)
- [aggregation.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aggregation.ts)

### Review layer / findings

- [findings/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/findings/index.ts)
- [20260406133000_analysis_review_findings.sql](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/migrations/20260406133000_analysis_review_findings.sql)

### Results / workspace

- [Results.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/Results.tsx)
- [ScriptWorkspace.tsx](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/pages/ScriptWorkspace.tsx)

### Exports

- [download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/download.ts)
- [downloadWord.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/analysis/downloadWord.ts)
- [download.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/web/src/components/reports/quick-analysis/download.ts)

---

## Practical Current Conclusion

The current system for DOCX should be understood as:

- **analysis and review architecture: substantially recovered**
- **workspace clicked-finding highlighting: recovered**
- **anchor precision for harder edge cases: still an improvement area**

Therefore:

- the consultant should not evaluate the system as “fully broken”
- and should also not rely on outdated assumptions that the workspace cannot visibly highlight clicked DOCX findings

The honest current status is:

- the platform now has a much stronger review data model
- visible clicked-finding highlighting in DOCX is now functioning again
- remaining work is more about edge-case precision than total visual failure

---

## Recommended Immediate Focus

If the consultant is helping prioritize next work, the immediate technical focus should be:

1. improve page-scoped exact anchor resolution for harder edge cases
2. improve duplicate-phrase disambiguation on the same page
3. continue reducing unresolved findings when text is visibly present
4. separately, later, improve the quality/specificity of AI rationale text

That order matches the real current bottleneck.
