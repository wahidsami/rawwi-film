# Finding source rules (Manual vs AI)

## Goal

Every finding has a single, reliable source: **`source = 'manual'`** or **`source = 'ai'`** (or **`source = 'lexicon_mandatory'`** for lexicon-triggered findings). The UI must display labels only from this column. No inference from `created_by`, `manual_comment`, or other fields.

---

## Schema

**Table:** `analysis_findings`

- **`source`** `text NOT NULL` with `CHECK (source IN ('ai', 'lexicon_mandatory', 'manual'))`.
- **`created_by`** `uuid REFERENCES auth.users(id)` — set for manual findings (user who added); null for AI/lexicon.

---

## Writers and what they set

| Writer | When | Sets `source` | Sets `created_by` |
|--------|------|----------------|-------------------|
| **POST /findings/manual** | User adds finding from UI | `'manual'` | `auth.uid()` |
| **Worker pipeline (lexicon)** | Lexicon mandatory match | `'lexicon_mandatory'` | not set (null) |
| **Worker pipeline (AI judge)** | AI judge produces finding | `'ai'` | not set (null) |
| **Aggregation** | Does not insert findings; only reads and builds report | — | — |

- **POST /findings/manual** must always set `source = 'manual'` and `created_by = auth.uid()`.
- AI and lexicon writers must always set `source = 'ai'` or `source = 'lexicon_mandatory'` and must not set `created_by` for the finding (or use service user only; do not use `created_by` to infer source).

---

## UI rules (no guessing)

- **Manual badge:** Show only when `finding.source === 'manual'`.
- **AI / Lexicon badge:** Show when `finding.source === 'ai'` or `finding.source === 'lexicon_mandatory'` (e.g. "AI" or "Lexicon" depending on design).
- **Do not** infer source from:
  - `created_by` (manual endpoint sets it, but AI must not be inferred from null)
  - `manual_comment`
  - `review_status` or severity changes

**ScriptWorkspace:** Report findings list and script findings (sidebar) use `source === 'manual'` for Manual and `(source === 'ai' || source === 'lexicon_mandatory')` for AI/Lexicon.

**FindingCard / other components:** Same rule; no heuristics.

---

## Backfill (optional)

If legacy rows have `created_by` set but `source != 'manual'`, run:

```sql
UPDATE analysis_findings
SET source = 'manual'
WHERE created_by IS NOT NULL AND source != 'manual';
```

Migration `0020_finding_source_backfill.sql` can do this once.

---

## Verification (smoke test)

1. **Manual finding:** Add a finding via "Add to findings" (selection → Save). Badge must show "Manual"; after refresh it must still show "Manual".
2. **AI findings:** Click "Start Smart Analysis", wait for completion. New findings must show "AI" (or "Lexicon" for lexicon-triggered). None must show "Manual" unless user-added.
3. **Old reports:** After running migration `0020_finding_source_backfill.sql` (if used), open an existing report; labels must be correct (manual vs AI/Lexicon) with no wrong "Manual" on AI findings.

---

# B) No auto-analysis on import

## Rule

Analysis (creation of `analysis_jobs` and `analysis_chunks`) must run **only** when the user clicks **"Start Smart Analysis"** (POST /tasks). Import (DOCX/PDF/TXT) must **not** create jobs or chunks.

## Contract

- **POST /extract** accepts `enqueueAnalysis?: boolean`. It calls `runIngest()` (creates job + chunks) **only when `enqueueAnalysis === true`**. Default is *not* to enqueue (so omit or pass `false` for import).
- **Frontend import flows** (ScriptWorkspace file upload, ClientDetails "Add Script") must pass **`enqueueAnalysis: false`** when calling `extractText(...)`.
- **POST /tasks** is the only endpoint that creates `analysis_jobs` and `analysis_chunks`; it is invoked only when the user clicks "Start Smart Analysis".

## Verification (smoke test)

1. **Import only:** Upload a DOCX/PDF/TXT (ScriptWorkspace or ClientDetails). Reports tab must stay empty; no new jobs in DB for that script.
2. **Then run analysis:** Click "Start Smart Analysis". A job and chunks must be created; report appears after completion.
