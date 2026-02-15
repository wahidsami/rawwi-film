# Offsets: global vs chunk-local coordinate system

## Summary

**Findings and the formatted viewer use a single coordinate system: global character offsets into the full canonical plain text (`script_text.content`).**

- **Global offset:** Character index in the full normalized script string (0 to content.length - 1).
- **Chunk-local offset:** Character index within a single chunk’s text (0 to chunk.text.length - 1). Used only inside the worker when calling the Judge; we convert to global before persisting.

---

## Where offsets are defined and used

### 1. Canonical text (base for all global offsets)

- **Source:** `script_text.content` — one normalized full script per version.
- **Produced by:** Extract or tasks: `normalize(htmlToText(content_html))` or `normalize(extracted_text)`.
- **Viewer:** Uses the same string (from GET /scripts/editor) to build the DOM text index and to validate finding offsets. Highlights are applied with `rangeFromNormalizedOffsets(domTextIndex, startOffsetGlobal, endOffsetGlobal)`.

### 2. Chunks (analysis_chunks)

- **Created by:** POST /tasks (and optionally POST /extract when enqueueAnalysis is true). Uses `chunkText(normalized)` from `_shared/utils.ts`.
- **chunkText()** splits the full normalized string and returns chunks with:
  - `text`: slice of normalized (chunk content),
  - `start_offset`, `end_offset`: **global** indices into the full normalized string (start and end of the slice).
- **DB columns:** `analysis_chunks.start_offset`, `analysis_chunks.end_offset` are therefore **global** (start/end of that chunk in `script_text.content`).

### 3. Worker pipeline (Judge → findings)

- **Judge API** returns locations as **chunk-relative**: `location.start_offset`, `location.end_offset` are indices within the chunk’s `text`.
- **Conversion:** In `pipeline.ts`, `toGlobalFinding(f, chunkStartOffset)` does:
  - `start_offset_global = chunkStartOffset + (f.location?.start_offset ?? 0)`
  - `end_offset_global = chunkStartOffset + (f.location?.end_offset ?? 0)`
  where `chunkStartOffset = chunk.start_offset` (global start of the chunk).
- **Persisted:** `analysis_findings.start_offset_global` and `end_offset_global` are **global** indices into the full script.

### 4. Lexicon findings

- Lexicon mandatory findings currently set `start_offset_global: null`, `end_offset_global: null` (no character span). They are not used for highlight ranges; only line-based location is stored.

### 5. Manual findings

- Set via POST /findings/manual using selection-derived offsets. The client sends `startOffsetGlobal` and `endOffsetGlobal` computed from the same canonical text (DOM index or plain selection), so they are **global**.

---

## How to tell global vs chunk-local

| Source              | Offsets in DB/API              | Base text           |
|---------------------|---------------------------------|---------------------|
| analysis_findings   | start_offset_global, end_offset_global | script_text.content (full) |
| analysis_chunks     | start_offset, end_offset       | script_text.content (chunk boundaries) |
| Judge response      | location.start_offset, end_offset (chunk-relative) | chunk.text |
| Viewer / highlights | startOffsetGlobal, endOffsetGlobal     | script_text.content (= domTextIndex.normalizedText) |

- If you see **small** start_offset_global values (e.g. 0–2000) for findings from **many different chunks**, that usually means something is wrong (e.g. chunk-local values stored as global). In a correct run, findings from later chunks have larger global offsets (e.g. 15000, 30000).
- If offsets span the full script length and match the excerpt when you slice canonical content, they are global and correct.

---

## If highlights still don’t appear

1. **Check [Highlights] log:** `total=X applied=Y offsetInvalid=A overlapSkipped=B surroundFailed=C`. If `offsetInvalid` is high, the slice at (start, end) in canonical content doesn’t match the finding’s excerpt (normalization or text mismatch). If `applied=0` and `surroundFailed` is high, DOM range creation or `surroundContents` is failing.
2. **Confirm canonical match:** In dev, we log when `canonicalContentForHighlights` and `domTextIndex.normalizedText` differ. They must be the same for highlights to align.
3. **First failures log:** Use the first 3 logged failures (id, start, end, excerpt, slicePreview) to see whether the stored offsets point at the wrong text (chunk-local vs global) or a different normalization.

---

## No change needed for coordinate system

Chunks are already created with global `start_offset`/`end_offset`. The worker already converts Judge’s chunk-relative locations to global before insert. Findings are stored and exposed as global. The viewer expects global offsets. The fix for “highlights do nothing” is to resolve any mismatch between the canonical text used for analysis and the one used in the viewer (see OFFSET_CANONICAL_TEXT.md and NORMALIZE_SPEC.md), and to use the new [Highlights] counters to see exactly where application fails (offsetValid, overlap, or surroundContents).
