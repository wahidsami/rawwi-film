# Canonical Hash Contract

This document describes how script canonical text and its hash are used to keep analysis findings and highlights in sync with the exact text the analysis ran against.

## Canonical text

- **Source of truth:** `script_text.content` is the canonical plain text used for:
  - Chunking and sending to the analysis pipeline
  - Storing finding offsets and excerpts
  - Highlighting in the script viewer
- Canonical text is **set once** at import or extract time (e.g. from DOCX/PDF or from `content_html`). It is **not** rewritten when creating or running analysis jobs.

## Stored on the job

- **`analysis_jobs.script_content_hash`** (nullable): SHA-256 hash of the exact canonical string that was used to build chunks and derive finding offsets.
- **`analysis_jobs.canonical_length`** (nullable): Length of that canonical string (optional; useful for quick sanity checks).

When POST `/tasks` creates a job, it:
1. Reads `script_text.content` for the script version (or, if missing/empty, computes it once from `content_html`/extracted text and saves it).
2. Computes the hash (and length) of that string.
3. Stores them on the job and uses that same string for chunking.

## Finding excerpts

When saving findings (worker/aggregation):
- **Excerpt** is derived by slicing the **same** canonical string with the finding’s global offsets:  
  `excerpt = canonical.slice(start_offset_global, end_offset_global)`  
  so the excerpt always matches the canonical base the analysis used.

## Viewer behaviour

- When a report/job is selected for highlights, the viewer fetches the job and uses `script_content_hash` (and optionally `canonical_length`).
- The viewer’s canonical text for highlighting is the one derived from current `script_text` (e.g. `content` or normalized from `content_html`), and its hash is compared to the job’s `script_content_hash`.
- **If they match:** highlights are applied using the stored offsets.
- **If they differ:**  
  - No highlights are applied (the apply-highlights effect returns early).  
  - A banner is shown: *“Script text changed since this analysis. Re-run Smart Analysis to highlight findings.”*  
  - The user should re-run analysis so a new job is created against the current canonical text.

## Rule: no canonical rewrite in /tasks

- If `script_text.content` already exists and is non-empty for the version, **/tasks must not overwrite it** when creating a job. It reads it as-is and uses it for hash, length, and chunking.
- Canonical content is only computed and written at import/extract (e.g. when `content_html` is present and `content` is missing or empty). This keeps the canonical string stable so existing jobs’ hashes remain valid until the user changes the script again.

## Summary

| Actor        | Responsibility |
|-------------|----------------|
| Import/Extract | Set `script_text.content` once; optionally set/update `content_hash` on script_text if used. |
| POST /tasks | Read `script_text.content`; do not rewrite it. Compute job `script_content_hash` and `canonical_length` from that string; chunk from it. |
| Worker      | Derive finding excerpts from the job’s canonical (normalized) text slice by global offsets. |
| Viewer      | Compare current canonical hash to `job.script_content_hash`; only highlight when they match; otherwise show banner and do not apply highlights. |
