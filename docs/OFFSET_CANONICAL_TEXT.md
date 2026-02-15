# Offset canonical text: single source for AI highlights

## Problem

AI finding offsets (`start_offset_global`, `end_offset_global`) are character offsets into a specific plain-text string. If the **viewer** uses a different string (e.g. raw extracted text with different newlines or trimming), highlights land on wrong or random spans.

## Canonical source

**The single canonical plain text for offset-based highlighting is `script_text.content`.**

- **Stored in:** `script_text.content` (and optionally mirrored in `script_versions.extracted_text` for legacy/display).
- **Produced by:** The same **normalized** string is written by:
  - **POST /extract:** After client sends `text`, the edge runs `normalizeText(extractedText)` and saves it via `saveScriptEditorContent(..., normalized, ...)` → `script_text.content`.
  - **POST /tasks:** When the user clicks “Start Smart Analysis”, the edge reads `script_versions.extracted_text`, runs `normalizeText(v.extracted_text)`, then overwrites `script_text` via `saveScriptEditorContent(..., normalized, ...)` and builds chunks from that same `normalized` string.
- **Consumption:**
  - **Worker:** Chunks are built from `normalized` (from tasks). AI findings get `start_offset_global` / `end_offset_global` as character offsets into that full normalized text. So worker offsets are relative to the same string that ends up in `script_text.content` after tasks run.
  - **Viewer:** **Highlight mode must use only `script_text.content` for offset-based segments.** In `ScriptWorkspace.tsx`, `canonicalContentForHighlights = editorData?.content` when non-empty (from GET /scripts/editor → `script_text.content`). Segment building and slice rendering use this; we do **not** use `extractedText` (raw or from version) for highlights, so offsets stay aligned.

## Normalization (single function)

**One function is used everywhere:** `normalizeText` in `supabase/functions/_shared/utils.ts`.

- **Definition:** Unicode NFC, then replace all runs of whitespace (including `\r\n`, `\n`, tabs) with a single space, then trim.
- **Used by:**
  - **Extract:** `normalized = normalizeText(extractedText)` before saving to `script_text` and (when enqueueing) before chunking.
  - **Tasks:** `normalized = normalizeText(v.extracted_text)` before saving to `script_text` and before `chunkText(normalized, ...)`.
- **Not applied in the viewer:** The viewer does not re-normalize; it displays `script_text.content` as-is (already normalized when saved).

So there is a single canonical normalization; no extra trimming or newline handling in the viewer.

## Content hash check strategy

- **Stored:** `script_text.content_hash` and `analysis_jobs.script_content_hash` both store the SHA-256 of the normalized string used for that version/job.
- **API:** GET /scripts/editor returns `contentHash` (from `script_text.content_hash`) so the client can compare if needed.
- **DEV diagnostic:** In ScriptWorkspace, when we have report findings we log a warning if:
  - There is no canonical content (editor not loaded), or
  - The length of canonical content differs from the length of the fallback display string (suggesting we might be showing the wrong source).
- **Runtime offset validation:** Before using a finding for highlights, we check that `content.slice(start, end)` matches or contains `evidence_snippet` (after normalizing whitespace). If not, that finding is not used for segment highlighting, so invalid offsets do not produce random marks.

## Summary

| Role        | Source / action |
|------------|------------------|
| Canonical  | `script_text.content` (normalized) |
| Normalize  | `normalizeText()` in `_shared/utils.ts` only |
| Extract    | Saves normalized to `script_text.content` (and raw to `script_versions.extracted_text`) |
| Tasks      | Reads `script_versions.extracted_text`, normalizes, overwrites `script_text.content`, chunks from same string |
| Worker     | Offsets are relative to that normalized full text |
| Viewer     | Uses `editorData.content` (= `script_text.content`) for segment building and slice; never `extractedText` for highlights |

This keeps a single canonical plain-text source end-to-end so AI highlights align with the visible text.
