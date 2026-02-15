Raawi Script Workspace + Findings + Glossary/Lexicon — Conversation Memory File (Full)

Owner: waheed sami (@wahidsami, Arab Premium)
Purpose: Carry full context to a new chat window without losing any decisions, bugs, fixes, or investigation trail.

0) High-level goal / product behavior we want
Script import + viewer + analysis + findings workflow (target UX)

User imports a document (TXT initially, later DOCX + PDF).

Imported text is shown in a viewer/editor with word wrap and a stable readable width (wide center column, touches side panels with reasonable margins).

User can run AI analysis only when clicking “Start Smart Analysis”.

Findings discovered by AI should reflect directly on the script text:

Highlighted in red.

Hover shows tooltip with the corresponding finding card.

Manual findings:

User selects a word/sentence in the viewer, right-clicks, chooses “Add to findings” (or “Add Note”).

Modal opens:

Dropdown for Article

Dropdown for Atoms of selected Article

Severity dropdown

Comment box

Dropdown to select which report the manual finding belongs to

On save:

Manual finding is included in the selected analysis report

Manual highlight appears immediately.

1) Early issues discovered (before major fixes)
A) Import limitations

Could only load TXT file format, not DOCX/PDF.

No rich text toolbar in script page (later agreed toolbar optional; at least word wrap + selection must work).

B) Viewer problems

Text selection “snaps away” on mouseup; blue selection disappears.

When saving manual finding, additional unrelated sentences were being marked (due to misaligned AI highlight logic / offsets mismatch).

Paragraph organization and formation of DOCX wasn’t preserved in viewer.

C) Auto-analysis happening on import (unwanted)

Uploading a DOCX caused an AI report to appear under reports tab even without clicking “Run analysis”.

Root cause: backend /extract called runIngest() by default, always creating an analysis job/chunks.

Desired behavior: import should save script text only, do not create job unless user clicks “Start Smart Analysis”.

2) Requests to “Cursor” (assistant created prompt(s))

Multiple Cursor prompts were crafted to:

Investigate import formats, editor, findings highlighting, manual finding flow.

Produce MD reports with “every little detail”.

Later: deep audit of methodology doc + how system evaluates articles/atoms.

Later: Glossary/Lexicon flow + why added terms not considered by AI.

3) Implemented features & fixes (chronological)
3.1 Article → Atom dropdown mapping (UI)

Added ARTICLE_ATOMS mapping from articleId "1"–"25" → atoms options “—” and “X.1”–“X.10”.

In ScriptWorkspace.tsx replaced Atom free-text input with Select.

Atom resets to '' when Article changes.

Backend unchanged: still sends atom_id string.

Question raised: Should atom_id be "1"…"10" OR "4.1" compound?

Enterprise recommendation: keep storage canonical as separate fields or stable atomic ID.

If backend expects only "1".."10", keep it; build compound in UI only.

Optional: change payload to ${articleId}.${atomId} if system-wide convention prefers.

3.2 DOCX/PDF import support (client-side)

DOCX parsing: mammoth

PDF parsing: pdfjs-dist with worker via dynamic import.

If extracted text is empty (scanned PDF), no /extract call; show toast and mark upload failed.

3.3 “Add to findings” + “Add Note”

Both open the same modal.

Manual save uses POST /findings/manual.

After save:

Optimistically append finding to reportFindings if viewing same job (so highlight appears immediately).

Then refetch findingsApi.getByJob and replace list to stay in sync.

3.4 Viewer width improvements

Outer wrapper: max-w-3xl → max-w-[980px]

Padding reduced/adjusted for better width and margins.

Editor card padding scaled.

3.5 Fix: analysis must NOT auto-run on import

Found cause: /extract defaulted enqueueAnalysis = body.enqueueAnalysis !== false (meaning omitted flag = true).

Fixed: const enqueueAnalysis = body.enqueueAnalysis === true;

Frontend import paths set enqueueAnalysis: false.

Now analysis only runs when user clicks “Start Smart Analysis” (POST /tasks).

3.6 Manual vs AI vs Lexicon findings (source labeling fix)

Problem:

UI treated “not ai” as manual, so lexicon_mandatory looked like manual.
Fix:

Use analysis_findings.source strictly:

manual → Manual

ai → AI Agent

lexicon_mandatory → Lexicon

Accept/Confirm buttons only for AI/Lexicon, not manual.
Optional migration:

Backfill: set source='manual' where created_by IS NOT NULL but source not manual.

3.7 DOCX formatting preserved (dual-layer → later removed)

Initial approach:

Store formatted HTML from mammoth in DB as script_text.content_html.

Plain text still used for analysis + offsets.

Viewer had 2 modes:

“Formatted” (renders HTML)

“Highlight” (plain segments for offset highlights & selection)

Added DOMPurify sanitization allowlist; added banner: “Highlights available in Highlight mode.”

Later decision:

“Highlight mode” was messy; user wanted formatted mode only + highlights.

4) Big pivot: formatted-only viewer + DOM offset mapping
4.1 Canonical text strategy (Strategy A)

When contentHtml exists:

canonical plain text is derived from HTML using htmlToText(html) and normalized.

canonical saved into script_text.content and used for chunking/jobs.

When no HTML:

canonical derived from extracted text as before.

4.2 DOM index mapping utilities

Added domTextIndex.ts:

TreeWalker collects text nodes in DOM order.

Builds:

normalizedText

mapping arrays:

normalized index → {node, offset} (normToDom)

rawToNorm (per-node arrays)

Functions:

rangeFromNormalizedOffsets(index, startNorm, endNorm) → returns DOM Range

selectionToNormalizedOffsets(index, selection, container) → compute canonical offsets from selection

4.3 Highlight engine on formatted HTML (single viewer)

Single div:

if contentHtml exists: dangerouslySetInnerHTML + dom index build after paint.

Highlight application:

unwrap all previous [data-finding-id]

for each finding:

validate offsets (offsetValid) by comparing normalized slice vs excerpt.

create Range with rangeFromNormalizedOffsets

surroundContents with <mark/span data-finding-id="...">

Tooltip via event delegation: nearest [data-finding-id].

Manual selection → canonical offsets using selectionToNormalizedOffsets.

Removed Highlight/Formatted toggle and the banner.

4.4 Normalization unification

Added docs/NORMALIZE_SPEC.md: NFC + collapse whitespace to single space + trim.

Frontend canonicalText.ts implements same normalizeText + htmlToText as backend.

domTextIndex.ts uses shared normalizeText.

Dev assertion in ScriptWorkspace logs mismatch if canonicalContent != DOM normalizedText.

4.5 Offset validity + overlap handling

Stronger offset validation:

Skip invalid range or excerpt mismatch; log details (id, start/end, excerptPreview, slicePreview).

Overlaps:

Sort by start asc, then end desc.

Skip overlapping findings (start < lastEnd) and log.

surroundContents try/catch logs failures.

4.6 Global offsets confirmed

Verified pipeline stores findings offsets as global indices:

chunk table stores global start_offset/end_offset

judge returns chunk-local offsets; pipeline converts by adding chunkStartOffset

manual findings already global.

5) Persistent pain: “Highlight does nothing” on some page(s)
5.1 “Script details page” vs ScriptWorkspace confusion

User clicked “Highlight” on a report card in a page that looked like “script details page”.

Expected: highlight appears in text viewer.

Observed: nothing happens.

Investigation led to checking which page actually contains the viewer where highlight DOM mutation happens (ScriptWorkspace).

5.2 DevTools command confusion

User tried:

document.quesrySelectorAll('[date-finding-id]').length (typos)
Correct:

document.querySelectorAll('[data-finding-id]').length
Or Chrome shorthand:

$$('[data-finding-id]').length

User’s console limited to typing; later $$('[date-finding-id]').length returned 0 because attribute name typo.

5.3 Logging showed partial highlight application

Logs:

Findings loaded: 50

Apply highlights effect runs

Stats example: total=50 applied=23 offsetInvalid=11 overlapSkipped=14 surroundFailed=2

Still user perceived “nothing highlighted” (likely wrong page/container or styling).

5.4 Canonical hash mismatch guard added

Introduced job hash vs editor content hash:

If mismatch: do not highlight; show banner “script changed since analysis”.

Still highlights didn’t work overall, so more debugging continued.

6) Glossary/Lexicon integration — major issue & fix set
6.1 Problem statement

Glossary section existed but nothing added there affected AI analysis.

Need to “feed AI” with new bad words/sentences.

6.2 Root causes discovered

Lexicon Edge function was stub:

GET /lexicon/terms returned []

POST/PUT returned 501

UI “adds” were not persisted.

Lexicon findings inserted without offsets:

start_offset_global/end_offset_global = null

So no highlighting.

6.3 Patch plan implemented

A) Edge Function supabase/functions/lexicon/index.ts

GET terms: select from slang_lexicon order by term

POST: insert term, set:

normalized_term = term.trim().toLowerCase()

severity_floor normalized to low/medium/high/critical

created_by = userId

409 on duplicate normalized_term

PUT: update allowed fields, set:

last_changed_by, last_change_reason

404 if not found

409 on duplicate

GET history: from slang_lexicon_history by lexicon_id ordered desc

B) Worker offsets for lexicon findings (apps/worker/src/pipeline.ts)

Use:

start_offset_global = chunkStart + match.startIndex

end_offset_global = chunkStart + match.endIndex

C) Debug log in ScriptWorkspace

Log DOM [data-finding-id] count + first IDs.

D) Lexicon history audit migration (0023)

Added last_changed_by + last_change_reason to slang_lexicon

Updated trigger fn to log these into history.

E) Test script

scripts/test-lexicon-api.sh to validate endpoints via curl.

F) Verification doc

docs/GLOSSARY_END_TO_END_VERIFICATION.md created: flow, code paths, evidence expectations, limitations, QA checklist.

6.4 Additional improvement: coordinate alignment assertion + evidence snippet

Confirmed matcher runs on exact chunk.text slice; indices align.

Added DEV assertion: canonical slice equals matchedText (exact or NFC/whitespace normalized); logs first 3 mismatches.

evidence_snippet derived from canonical slice for lexicon findings.

Stored location.context_before/context_after (20 chars each).

6.5 Matching normalization contract (documented)

normalized_term only for UI uniqueness; worker matches using raw term.

term_type behavior:

word: word boundary regex (case-insensitive in Latin)

phrase: substring match, case-insensitive in Latin

regex: raw pattern; flags gui; no lowercasing

Arabic normalization: none (no diacritics/kashida/alef–yaa), documented as limitation.

6.6 Glossary UX improvement

Added helper text under term_type dropdown describing word/phrase/regex semantics (EN/AR).

Added Arabic warning under Term input about no Arabic normalization (EN/AR).

Strengthened .ap-highlight in CSS (more visible red background/outline/padding).

7) Critical bug fix: React-owned DOM vs mutated DOM (highlight stability)
7.1 Issue

DOM mutation highlighter (unwrapFindingMarks, surroundContents) was sometimes running on a fallback container that React renders children into.

This caused:

removeChild errors

highlights silently failing

broken selection behavior.

7.2 Fix set applied

Only run highlight DOM mutation when we own container:

In highlight effect: bail unless:

editorData.contentHtml exists AND

editorContentHtmlSetRef.current === editorData.contentHtml

Prevents mutating React-owned fallback div.

Safe removeChild in unwrapFindingMarks:

Only remove if node is still a child: if (el.parentNode === parent) ...

Stable keys for two branches:

HTML branch: key "editor-with-html"

Fallback branch: key "editor-fallback"

Forces React to mount/unmount separate nodes; avoids reusing same node across branches.

DEV logs added:

Guard log when effect bails:

[Highlights] guard: hasHtml=%s htmlOwned=%s findings=%d

Applied marks log after apply:

[Highlights] applied marks: %d

Both capped by “findings length changed”.

8) Methodology doc + “Articles/Atoms evaluation” deep inspection (requested)

User requested:

Read and deeply understand the doc “منهجية ومعايير منصة راوي...”

Then create Cursor prompt to inspect how system maps articles → atoms, and how scan/prompt evaluation works, suspecting something wrong.

Cursor prompt should:

Extract PolicyMap JSON: article, atoms, indicators, violating/non-violating examples.

Add trace/instrumentation: which indicator triggered, evidence_snippet, offsets, canonical hash, slice at runtime.

Build minimal test harness with Arabic snippets per key articles.

Diagnose likely root causes: normalization mismatch, evidenceSnippet fallback, broad indicator matching, atom mapping errors, chunk boundaries.

Patch plan: single normalize function; require offsets; no naive replace fallback; non-violation guardrails.

9) Files repeatedly referenced / created during the work (quick orientation)
Frontend

apps/web/src/pages/ScriptWorkspace.tsx

apps/web/src/pages/ClientDetails.tsx

apps/web/src/utils/documentExtract.ts

apps/web/src/utils/sanitizeHtml.ts

apps/web/src/utils/canonicalText.ts

apps/web/src/utils/domTextIndex.ts

apps/web/src/index.css

apps/web/src/pages/Glossary.tsx

Backend (Supabase Edge Functions)

supabase/functions/extract/index.ts

supabase/functions/scripts/index.ts

supabase/functions/_shared/scriptEditor.ts

supabase/functions/_shared/utils.ts

supabase/functions/tasks/index.ts

supabase/functions/lexicon/index.ts

Worker

apps/worker/src/pipeline.ts

Migrations

0019_script_text_content_html.sql

0020_finding_source_backfill.sql (optional)

0023_lexicon_history_audit.sql

Docs / reports created

docs/IMPLEMENTATION_NOTES_import_and_add_to_findings.md

docs/FORMATTED_ONLY_HIGHLIGHTS.md

docs/NORMALIZE_SPEC.md

docs/HIGHLIGHT_ALIGNMENT_DEBUG.md

docs/OFFSETS_GLOBAL_VS_CHUNK.md

docs/CANONICAL_HASH_CONTRACT.md

docs/FINDING_SOURCE_RULES.md

docs/GLOSSARY_DEBUG_PATCH_PLAN.md

docs/GLOSSARY_END_TO_END_VERIFICATION.md

scripts/test-lexicon-api.sh

User-uploaded reports / evidence

script-import-and-editor-audit.md

editor-highlights-and-manual-findings-audit.md

SELECTION_BUG_INVESTIGATION.md

GLOSSARY_LEXICON_FLOW.md

GLOSSARY_END_TO_END_VERIFICATION.md

Multiple screenshots: ScriptDetails page, selection snapping, highlight-mode banner, glossary UI.

10) Current “known truths” after all patches

Import should not enqueue analysis unless user clicks “Start Smart Analysis”.

Findings are stored with a source field and UI must not infer manual/ai by negation.

For formatted DOCX view:

Highlights rely on canonical offsets mapped into DOM ranges.

Normalization must match between backend canonical and frontend DOM text.

Glossary:

Must persist in DB via lexicon Edge function.

Worker uses DB cache (refresh ~2 min).

Lexicon findings must have global offsets + evidence_snippet to highlight correctly.

Highlight stability depends on mutating only a DOM container “owned” by innerHTML, never React-owned children.

Debugging logs now distinguish:

bail due to not owning container

apply success and mark count

11) Practical debugging checklist (when “still nothing highlights”)

Console:

[Highlights] guard: hasHtml=?, htmlOwned=?, findings=?

[Highlights] applied marks: N

Stats: total/applied/offsetInvalid/overlap/surroundFailed

If hasHtml=false: fallback branch; highlighter won’t mutate.

If hasHtml=true but htmlOwned=false: ref mismatch/timing/sanitization mismatch.

If applied marks > 0 but not visible: CSS override issue; inspect .ap-highlight.

If applied marks = 0: offsets invalid or mapping failing; check invalid mismatch logs.

12) Outstanding / future improvements

Arabic normalization support for lexicon matching and/or canonical mapping (diacritics/kashida/alef variants).

“soft_signal” lexicon terms not inserted as findings or passed to Judge prompt yet.

Reduce noisy render logs (gate console.count('[ScriptWorkspace] render')).

13) User’s key expectations (must remain true)

When user adds a violating word/sentence in Glossary today, it should:

persist,

be detected on next analysis (respect cache delay),

appear as Lexicon finding (not manual),

highlight on the script text viewer correctly.

Script text displays formatted DOCX structure, readable width, selection works for manual findings.

Analysis runs only on explicit button click.

END OF MEMORY FILE