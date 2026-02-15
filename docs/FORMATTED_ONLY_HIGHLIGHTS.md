# Formatted-only viewer with accurate highlights (Option B)

## Overview

The script viewer has a single mode: **formatted view**. When the script has `content_html` (e.g. from DOCX import), the viewer renders that HTML and shows AI/manual finding highlights by mapping canonical plain-text offsets to DOM ranges and wrapping them in `<mark>` elements. When there is no `content_html` (e.g. PDF/TXT), the viewer falls back to plain-text rendering with segment-based highlights. There is no separate "Highlight mode" toggle.

## Canonical text derivation (Strategy A)

- **Canonical plain text** for all offsets is `script_text.content`.
- **When HTML exists:** Canonical text is derived from the same HTML that is rendered:
  - **Extract (DOCX):** Client sends `contentHtml` (mammoth). Edge computes `content = normalize(htmlToText(contentHtml))` and saves both `script_text.content` and `script_text.content_html`. So offsets from the worker (which use this normalized content) match the text that would be produced by walking the rendered DOM and normalizing.
  - **Tasks (Start Smart Analysis):** If `script_text.content_html` is present, tasks derive `content = normalize(htmlToText(content_html))` and overwrite `script_text.content` with that, so analysis chunks and AI finding offsets are again relative to the same string as the formatted viewer.
- **When HTML is absent (PDF/TXT):** Canonical text is `normalize(extractedText)` as before; the viewer shows plain text and segment-based highlights.

So **one canonical source** is used end-to-end: `script_text.content`, with derivation from HTML when available.

## Mapping approach

- **Backend:** `htmlToText(html)` in `_shared/utils.ts` strips tags and returns text in document order. `normalize(htmlToText(html))` is what is stored as `script_text.content` when HTML is provided.
- **Frontend:** When the formatted HTML container is mounted, we build a **DOM text index** (`domTextIndex`):
  1. **TreeWalker** over the container with `NodeFilter.SHOW_TEXT` collects text nodes in DOM order.
  2. **Raw string** = concatenation of those text node values.
  3. **Normalized string** = same normalization as backend (NFC, collapse whitespace to single space, trim). This must match `script_text.content` for the same HTML.
  4. **Mappings:**
     - `normToDom`: for each index in the normalized string, the (text node, offset within node) that corresponds to the start of that character.
     - Per-node arrays and `rawToNorm` support mapping (node, offset) and raw offsets to normalized indices.
- **Highlights:** For each finding with `start_offset_global` and `end_offset_global`, we create a DOM `Range` from the index, then wrap it in a `<mark data-finding-id="...">` with severity styling. We **unwrap** all existing `[data-finding-id]` marks before re-applying so we do not nest marks when findings change.
- **Selection → offsets:** On selection (context menu or floating "Add to findings"), we use `selectionToNormalizedOffsets(index, selection, container)` to get canonical start/end. That requires the selection to be in **text nodes** that are part of our index (element boundaries are not supported). Those offsets are sent to POST `/findings/manual` and the new finding is then highlighted on the next apply.

## Normalization

- Single function: **`normalizeText`** in `supabase/functions/_shared/utils.ts` (NFC, collapse `\s+` to space, trim).
- Used by: extract, tasks, chunking, and the frontend `domTextIndex` uses the same logic in `domTextIndex.ts` so that `index.normalizedText === script_text.content` when the DOM is rendered from `content_html`.

## Offset validation guard

- Before using a finding for highlights we call **`offsetValid(canonicalContent, f)`**: we check that `canonicalContent.slice(start, end)` (whitespace-normalized) matches or contains `f.evidenceSnippet`. If not, we skip that finding so we do not draw highlights on random spans.
- In the formatted view we only apply highlights for findings that pass this check and whose offsets are within range.

## Known limitations

- **Selection:** Canonical offsets from selection are only computed when both range boundaries are **text nodes** that belong to the container we indexed. Selections that end on element boundaries (e.g. "after this paragraph") are not mapped; the user can re-select with the caret in the text to get valid offsets.
- **Overlapping findings:** If two findings have overlapping ranges we still wrap both; the DOM may contain nested `<mark>` elements. Styling remains correct; no extra logic to merge or exclude overlaps.
- **No Highlight mode:** The old "Highlight" vs "Formatted" toggle is removed. Formatted HTML is shown when available; otherwise plain text with segment highlights is shown.
- **RTL / Arabic:** The formatted div uses `dir="rtl"` and the same DOM index works; offsets are character-based in the normalized string, not visual.

## Files

- **Backend:** `supabase/functions/_shared/utils.ts` (`htmlToText`, `normalizeText`); `extract/index.ts` (canonical from HTML when `contentHtml` present); `tasks/index.ts` (canonical from `script_text.content_html` when present).
- **Frontend:** `apps/web/src/utils/domTextIndex.ts` (DOM text index, `rangeFromNormalizedOffsets`, `selectionToNormalizedOffsets`); `apps/web/src/pages/ScriptWorkspace.tsx` (single viewer, build index, apply highlights, tooltip delegation, selection → offsets for manual findings).
