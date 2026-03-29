# Architecture, Issues, and Performance Handoff

Date: 2026-03-26

## Executive Summary

This system is a three-part pipeline:

1. `apps/web`: operator frontend for ingestion, review, reporting, and administration.
2. `supabase/functions`: API and workflow layer over RBAC, scripts, jobs, findings, and reports.
3. `apps/worker`: chunk-based AI analysis worker that produces findings and final reports.

For large scripts, especially around 400 pages, the current runtime is dominated by:

- serial chunk processing
- one router call per chunk
- ten detector calls per chunk
- optional hybrid auditor and rationale-only calls
- repeated DB reads inside each chunk

The most important finding is that the router currently adds cost but provides almost no reduction in downstream work, because `ALWAYS_CHECK_ARTICLES` is set to all scannable articles.

## Document Intake Coverage

The client can provide more than plain script pages. The importer should explicitly detect and surface these cases instead of silently flattening them:

- probable tables or column layouts
- struck-through / crossed-out text
- scanned pages that required OCR
- mixed Arabic/English layout drift
- fragmented or obfuscated words that need review
- repeated headers / footers
- form-like pages, checklists, and stamp-heavy pages
- multi-column or side-note layouts

Current implemented awareness:

- probable table detection warnings during import
- probable multi-column layout warnings during import
- probable form-like / field-heavy page warnings during import
- probable repeated header/footer detection
- conservative normalization of obvious PDF table rows into delimited text for better AI readability
- struck-through text detection metadata on PDF pages
- OCR usage metadata on PDF pages
- fragmented Arabic words routed to manual review notes
- document-structure hints injected into report special notes for human auditors

Still worth adding next:

- stamp / seal / handwritten annotation hints
- structured preservation for DOCX/PDF tables instead of text-only flattening

## Architecture Map

### Frontend

The frontend is a substantial operator console, not just a viewer.

Core areas:

- authentication and RBAC-aware shell
- client/company management
- script upload, extraction, workspace review
- findings and report review
- glossary/lexicon management
- audit and access control
- client-side PDF exports

Key workflow page:

- `apps/web/src/pages/ScriptWorkspace.tsx`

Important frontend behavior:

- PDF/DOCX extraction happens client-side in `apps/web/src/utils/documentExtract.ts`
- formatted HTML and page-aware editing/highlighting are handled in the web app
- report PDF generation is done client-side with `@react-pdf/renderer`

### Backend / Supabase Functions

Main responsibilities:

- ingest extracted text/pages
- queue analysis jobs and chunks
- expose findings and reports
- enforce RBAC and scope
- manage users, invites, notifications, glossary, dashboard, and audit

Important endpoints:

- `supabase/functions/extract/index.ts`
- `supabase/functions/tasks/index.ts`
- `supabase/functions/scripts/index.ts`
- `supabase/functions/findings/index.ts`
- `supabase/functions/reports/index.ts`

### Worker

The worker performs:

1. lexicon matching
2. router
3. multi-pass AI detection
4. dedupe / overlap collapse
5. optional hybrid context + deep auditor
6. findings persistence
7. aggregation into report

Key files:

- `apps/worker/src/index.ts`
- `apps/worker/src/pipeline.ts`
- `apps/worker/src/multiPassJudge.ts`
- `apps/worker/src/aggregation.ts`
- `apps/worker/src/methodology-v3/index.ts`

## Large-Script Runtime Diagnosis

### Current chunking model

Jobs are created with:

- chunk size `12_000`
- overlap `800`

Source:

- `supabase/functions/tasks/index.ts`

Effective unique stride is about `11_200` characters per chunk.

Approximate chunk count:

`chunk_count ~= ceil((text_length - 12_000) / 11_200) + 1`

Example:

- if a 400-page script normalizes to about `800,000` characters, chunk count is roughly `71`

### Calls per chunk

On a cache miss, each chunk currently does:

- `1` router call
- `10` detector passes in parallel
- `0+` hybrid auditor calls
- `0+` rationale-only follow-up calls

So the base AI cost is roughly:

`11 AI calls per chunk before hybrid extras`

For ~71 chunks, that is roughly:

- `781` AI calls before deep-auditor or rationale-only work

### Why a 400-page script feels slow

Because the pipeline is not just "one analysis call for the script". It is a large number of chunk-level AI calls executed in a single-worker serial flow.

The dominant runtime pattern today is:

- claim one chunk
- process one chunk
- run aggregation check
- move to next chunk

This means total wall-clock time scales almost linearly with chunk count.

## High-Impact Issues

### 1. Router is effectively a no-op for pruning

Files:

- `apps/worker/src/gcam.ts`
- `apps/worker/src/policyMap.ts`
- `apps/worker/src/pipeline.ts`

Details:

- `ALWAYS_CHECK_ARTICLES` is defined as `getScannableArticleIds()`
- `getScannableArticleIds()` returns all non-admin, non-out-of-scope articles
- selected router candidates are merged with `ALWAYS_CHECK_ARTICLES`

Effect:

- the router runs
- but downstream article selection still includes the full scannable set
- so router cost is paid without meaningful reduction in pass workload

This is the single clearest wasted-cost issue in the current design.

### 2. Worker processes one chunk at a time

Files:

- `apps/worker/src/index.ts`
- `apps/worker/src/jobs.ts`

Details:

- the worker claims a single pending chunk
- processes it
- calls `runAggregation(job.id)`
- then moves on

Effect:

- large jobs are serialized
- one long script monopolizes time
- throughput is low unless multiple worker processes are manually run

### 3. Every chunk runs all detector passes

File:

- `apps/worker/src/multiPassJudge.ts`

Details:

- there are `10` detection passes
- several use `gpt-4.1`
- passes are parallel within a chunk, but chunk-to-chunk execution remains serial

Effect:

- expensive per-chunk fan-out
- runtime and cost both rise quickly with chunk count

### 4. Multi-worker scaling is weaker than it should be

Files:

- `apps/worker/src/index.ts`
- `apps/worker/src/jobs.ts`

Details:

- workers fetch the next pending chunk first
- then claim it in a second step
- when multiple workers poll at the same time, they can all target the same earliest chunk
- only one claim succeeds; the others back off until the next poll

Effect:

- horizontal scaling is possible, but inefficient
- multiple workers will not realize full chunk-level parallelism until chunk selection and claiming are combined

### 5. Expensive work is repeated inside each chunk

File:

- `apps/worker/src/pipeline.ts`

Repeated per chunk:

- fetch `script_pages`
- fetch `slang_lexicon`
- inject lexicon into prompts
- compute page-local offsets
- perform cache lookup and write

Effect:

- avoidable DB overhead on large jobs
- more latency per chunk than necessary

### 6. Aggregation is checked after every chunk

Files:

- `apps/worker/src/index.ts`
- `apps/worker/src/aggregation.ts`

Details:

- `runAggregation(job.id)` is called after each chunk
- aggregation short-circuits when active chunks remain, but the check still happens

Effect:

- extra DB work on every chunk
- not the biggest bottleneck, but unnecessary overhead on large jobs

### 7. Overlap makes downstream full-text reconstruction incorrect

File:

- `apps/worker/src/aggregation.ts`

Details:

- chunking uses overlap
- aggregation reconstructs `fullScriptText` by joining chunk texts with `"\n"`

Effect:

- overlapped text is duplicated
- script summary and "words to revisit" run on duplicated content
- prompt size and cost increase
- report-level summary signals can be skewed

This is both a performance issue and a correctness issue.

### 8. Page-aware chunking exists but is off by default

File:

- `supabase/functions/tasks/index.ts`

Details:

- `ANALYSIS_CHUNK_BY_PAGE` must be true to use page-preserving chunking
- otherwise the system uses generic character chunking with overlap

Effect:

- large page-based scripts may be chunked less naturally than they could be
- more overlap and less coherent locality than page/scene-aware segmentation

### 9. Hybrid "shadow" mode still persists hybrid output

File:

- `apps/worker/src/pipeline.ts`

Details:

- comment explicitly states that shadow mode still persists hybrid findings

Effect:

- "shadow" is not a clean no-impact evaluation mode
- rollout behavior is harder to reason about

### 10. Test isolation is weak

Files:

- `apps/worker/src/db.ts`
- `apps/worker/package.json`

Details:

- worker tests initialize Supabase client at import time
- tests fail without env setup

Effect:

- hard to validate performance or correctness changes quickly
- slower iteration loop during optimization work

### 11. Comments/docs have drifted from runtime behavior

File:

- `apps/worker/src/multiPassJudge.ts`

Details:

- header comment still describes fewer passes than the actual implementation

Effect:

- easier to misread the cost model
- onboarding and debugging take longer

## Recommended Optimization Roadmap

### Immediate Wins

These are the best first moves because they give strong runtime benefit without redesigning the product.

#### A. Fix router pruning or remove the router temporarily

Options:

- make `ALWAYS_CHECK_ARTICLES` a truly small safety-critical subset
- or disable the router until pass gating is real

Expected impact:

- remove one wasted AI call per chunk, or make the router actually useful

#### B. Parallelize chunks across workers

Options:

- run multiple worker processes
- or add in-process chunk concurrency with a small semaphore, for example 2-4 chunks at once

Expected impact:

- biggest wall-clock improvement for large scripts

Risk:

- OpenAI/Supabase rate limits
- must tune concurrency carefully

Important note:

- to get the full benefit, chunk selection should become an atomic "claim next pending chunk" operation instead of fetch-then-claim

#### C. Cache job-level data instead of refetching per chunk

Good candidates:

- `script_pages`
- active lexicon rows
- prompt-injected lexicon strings

Expected impact:

- lower latency per chunk
- lower DB pressure

#### D. Stop reconstructing full script from overlapped chunks

Use one of these instead:

- `analysis_jobs.normalized_text`
- `script_text.content`

Expected impact:

- fixes duplicated-text bug
- reduces summary/revisit prompt inflation
- improves report correctness

#### E. Defer expensive report extras for very large jobs

Candidates:

- script summary
- words to revisit
- deep auditor
- rationale-only pass

Approach:

- produce core findings first
- run enrichments after job completion, or behind a "large script mode"

Expected impact:

- faster first usable result

### Medium-Term Improvements

#### F. Pass gating

Instead of always running all 10 passes on every chunk:

- run a cheap lexical/signal pre-scan
- activate only relevant passes

Examples:

- no country/entity names -> skip international relations pass
- no drug terms -> skip substances pass
- no violence verbs -> skip violence pass

Expected impact:

- major cost and latency reduction

#### G. Two-stage model strategy

Pattern:

- stage 1: cheap detector
- stage 2: expensive confirmer only for positive or borderline findings

This is likely better than using many `gpt-4.1` passes on every chunk.

#### H. Better chunking

Ideas:

- enable page-aware chunking by default when pages exist
- add scene-aware chunking for scripts
- use larger chunks for low-density narrative sections
- reduce overlap when page/scene boundaries are strong

### Larger Redesign Ideas

#### I. Hierarchical analysis

Suggested flow:

1. classify pages/scenes for risk
2. only deep-analyze risky regions
3. aggregate scene/page results into script report

This is the most promising architecture if large scripts are a core use case.

#### J. Split "compliance report" from "full enrichment"

Two deliverables:

- fast compliance-first result
- slower enriched report with rationale, summary, revisit words, and deep audit

This can improve user experience even before total compute time is reduced.

## Suggested Experiments

To avoid guessing, measure these next:

1. chunk count for a real 400-page script
2. mean and p95 chunk runtime
3. router runtime per chunk
4. pass runtime breakdown per detector
5. hybrid auditor cost per chunk
6. DB query count per chunk
7. total job time with 1 worker vs 2 workers vs 4 workers

Minimum logging to add:

- `job_id`
- `chunk_index`
- `chunk_text_length`
- router duration
- each pass duration
- hybrid duration
- insert duration
- total chunk duration

## Recommended First Sprint

If the goal is "make 400-page analysis meaningfully faster", the highest-value first sprint is:

1. fix router no-op behavior
2. run 2-4 chunks concurrently
3. cache script pages and lexicon per job
4. use canonical full text instead of rejoining overlapped chunks
5. make summary/revisit/deep-auditor optional for large jobs

That combination should improve both wall-clock time and system clarity without requiring a full rearchitecture.

## Files Most Relevant To The Performance Problem

- `apps/worker/src/index.ts`
- `apps/worker/src/jobs.ts`
- `apps/worker/src/pipeline.ts`
- `apps/worker/src/multiPassJudge.ts`
- `apps/worker/src/aggregation.ts`
- `apps/worker/src/gcam.ts`
- `apps/worker/src/policyMap.ts`
- `supabase/functions/tasks/index.ts`

## QA Closure Tracker

This section is the practical checklist to compare against after each implementation step.

Status legend:

- `Closed`: implemented and verified in code
- `Validation`: implementation exists; needs end-to-end QA on real files/workflows
- `Open`: not fully implemented yet

### Closed

- Processing speed improvements for long scripts
- Severity and article routing improvements
- Narrative/context arbitration improvements
- Repeatability and deterministic ordering improvements
- Arabic obfuscation handling improvements
- Analysis popup redesign
- Pause / resume
- Stop with partial report
- Stale `judging` chunk auto-recovery
- Workspace/report finding alignment improvements
- Automatic finding highlight on finding-card click
- Fuller sentence-based highlight resolution in workspace
- Manual finding save hardening
- Duplicate manual-note action removed
- Clickable severity filter cards in analysis report
- Bulk select / select all in workspace report findings
- Bulk mark-selected-safe action in workspace
- Finding reclassification workflow in workspace
- AI/manual separation in workspace findings
- Re-analysis carries forward manual findings into new jobs
- Previous-review / client-linked duplicate-work indicators in workspace
- Re-review workflow with explicit return-to-review reason
- Upload filename validation improvements
- Word export for analysis reports
- Official logo support in analysis report exports
- Company validation improvements (email, mobile, duplicate names)

### Validation

- PDF import text cleanup
- DOCX import text fidelity
- Severity classification consistency across all edge cases
- Sensitive-content detection coverage
- Repeated observation grouping and propagation
- Highlight accuracy on all real imported files

### Open
- None in the currently tracked QA closure list

### Current Highest-Priority Validation Targets

1. Imported PDF and DOCX text quality on fresh imports
2. Finding-card sentence vs highlighted sentence match
3. Reclassification behavior in real review flow
4. Bulk review actions in real workspace usage
5. Re-review + script-status sync in real reviewer flow

### Recommended Next Implementation Order

1. End-to-end QA on imported files and highlighting
2. End-to-end QA on reviewer workflow (bulk, reclassify, re-review)
3. Compare Quality / Balanced / Turbo on the same long script

## Human-Audit Inspired Expansion

This section tracks a new layer inspired by how Saudi Film Commission reviewers appear to audit scripts in practice.

Important framing:

- This does **not** replace the current article/atom system.
- It adds a parallel **editorial + cultural compliance layer** that can produce supporting findings, structured notes, or routing hints.
- The goal is to make the AI behave more like a human compliance auditor without weakening the legal taxonomy already in place.

### What Human Auditors Are Clearly Doing

Based on the sample audit behavior, the human review process appears to combine:

1. sequential page-by-page reading
2. rule-trigger detection
3. structured issue logging
4. explicit adjustment rationale

Their notes behave like:

- `location`
- `issue`
- `reason`
- `action`

This is effectively a human compliance tagging system layered on top of the script.

### New Dimensions To Add

#### 1. Editorial / Script Integrity Signals

Examples:

- crossed-out text or scenes
- ambiguous kept-vs-deleted edits
- orphan fragments after manual edits
- duplicated or partially removed scene blocks

Why it matters:

- humans treat these as editorial compliance signals, not just visual formatting
- a crossed-out scene should not silently disappear from the imported script
- the system should preserve that text and flag that it appears intentionally struck through

Planned outputs:

- imported text keeps the original text content
- page metadata marks the span as `editorial_deleted_candidate`
- a finding or special note is created under a `script_integrity` family

#### 2. Dialect / Localization Compliance

Examples:

- non-Saudi dialect in dialogue
- mixed regional dialect drift
- wording that conflicts with expected Saudi localization

Why it matters:

- human auditors repeatedly log this as a first-class compliance issue
- it is not fully captured by current legal atoms alone

Planned outputs:

- `dialect_compliance` hints/findings
- page/snippet evidence
- rationale such as `requires Saudi dialect localization`

#### 3. Religious / Cultural Formula Compliance

Examples:

- prohibited oath patterns
- culturally sensitive curse formulas
- phrasing that triggers faith-value concerns even if not a core legal violation atom

Why it matters:

- this is often a reviewer-facing compliance adjustment, not only a model-detected policy atom

Planned outputs:

- supporting compliance notes alongside existing article findings
- improved rationale text for Article 5 / faith-and-values style issues

#### 4. Sensitive Historical / Political Alignment

Examples:

- references to sensitive Saudi historical incidents
- depictions that are not strictly illegal in text form but require alignment in portrayal/tone

Why it matters:

- human reviewers frequently mark these as `للمواءمة`
- this is closer to `alignment needed` than a pure binary violation

Planned outputs:

- `alignment_required` notes
- stronger report wording for sensitive-event portrayal
- optional dedicated checklist category later

### Proposed System Modules

These would sit above or beside the current atoms:

1. `script_integrity`
- struck-through text
- unclear edits
- partial removals
- orphan scene fragments

2. `dialect_localization`
- Saudi vs non-Saudi dialogue patterns
- dialect drift heuristics

3. `cultural_religious_compliance`
- oath formulas
- culturally sensitive expressions
- localized religious-risk phrasing

4. `sensitive_event_alignment`
- sensitive event/entity/topic detection
- tone/alignment recommendation instead of only hard violation logic

### Proposed Status Tracker

#### Open

- Detect struck-through / crossed-out text during PDF import
- Preserve struck-through text as readable extracted text instead of losing it
- Mark struck-through spans in page metadata for the workspace
- Emit a `script_integrity` finding or special note for struck-through content
- Add dialect/localization review hints
- Add cultural/religious formula review hints
- Add sensitive-event alignment notes (`للمواءمة` style)

### Phased Delivery Plan

#### Phase 1 — Metadata Plumbing and Safe Scaffolding

Goal:

- create a safe transport path for extraction-side annotations without changing legal findings yet

Deliverables:

- `script_pages.meta` JSON storage
- worker writes per-page extraction provenance and quality flags
- scripts/editor API returns page metadata to workspace
- workspace can later consume `strike_spans`, `ocr_used`, or `saudi_sensitivity_hints` without schema redesign

#### Phase 2 — Struck-Through / Editorial Deletion Detection

Goal:

- preserve text that appears intentionally crossed out and expose it as an editorial signal

Deliverables:

- server-side PDF geometry pass for line/strike detection
- `strike_spans` in page metadata
- workspace visual treatment for struck-through spans
- `script_integrity` finding or special note generation

#### Phase 3 — Saudi Sensitivity Alignment Layer

Goal:

- detect content that may relate to Saudi Arabia, the royal family, state institutions, sensitive historical incidents, or national/religious sites

Deliverables:

- `saudi_reference_detected`
- `saudi_sensitive_reference`
- `saudi_historical_event_reference`
- `saudi_royal_reference`
- `alignment_review_required`

Behavior:

- mostly `needs_review` or `special note`, not hard violation by default
- evidence-first, conservative wording
- remains separate from current article/atom legal decisions

#### Phase 4 — Dialect / Localization Layer

Goal:

- surface non-Saudi dialect or localization drift as review-grade findings

Deliverables:

- dialogue-focused dialect hints
- localization review note templates
- optional reviewer wording such as `يتطلب مواءمة باللهجة السعودية`

#### Phase 5 — Cultural / Religious Formula Layer

Goal:

- catch recurring formula-based issues that human auditors commonly flag

Deliverables:

- oath and curse pattern hints
- culturally sensitive expression notes
- stronger rationale support for faith-and-values style findings

#### Recommended Build Order

1. Detect struck-through text and preserve it in extraction
2. Surface struck-through spans in workspace and create `script_integrity` notes
3. Add dialect/localization heuristics
4. Add cultural/religious formula heuristics
5. Add sensitive-event alignment notes

### Notes On Implementation Direction

For struck-through text specifically:

- this should likely be solved in the PDF import/extraction pipeline, not only in the AI stage
- we need both:
  - text preservation
  - visual/editorial signal detection

The likely architecture is:

1. detect text spans intersected by drawn horizontal rules or strike marks on the PDF page
2. keep the underlying text in extracted output
3. annotate the span in page metadata
4. surface a structured finding/note in the workspace/report pipeline

This should be treated as a high-value trust feature because it directly mirrors human editorial review behavior.
