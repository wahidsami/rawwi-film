# Highlight alignment debug report

This doc describes how we validate and fix misaligned highlights (formatted-only viewer) and how to interpret dev-only logs.

## 1. One normalize implementation

- **Spec:** `docs/NORMALIZE_SPEC.md`. Same transform everywhere: NFC, collapse `\s+` to single space, trim.
- **Backend:** `supabase/functions/_shared/utils.ts` → `normalizeText`, `htmlToText`.
- **Frontend:** `apps/web/src/utils/canonicalText.ts` → `normalizeText`, `htmlToText` (same algorithm). Used by `domTextIndex.ts` so `buildDomTextIndex` produces `normalizedText` byte-identical to `script_text.content` when the DOM is from the same HTML.

**Dev assertion:** When both `editorData.content` (canonical from server) and `domTextIndex.normalizedText` exist, we check byte-identity in a `useEffect` (dev only). If they differ we log:

- `[ScriptWorkspace] canonical vs dom normalizedText MISMATCH: canonical length X dom length Y`

**How to verify:** Load a script with formatted HTML and a report with findings. Open devtools console. If you never see the MISMATCH warning, normalizedText and canonical content are identical. If you see it, investigate sanitization differences (client uses `sanitizeFormattedHtml(contentHtml)`) or normalization drift.

## 2. Build index only on unwrapped DOM

- **Fix:** Before building the DOM text index we always unwrap any existing `[data-finding-id]` marks, then call `buildDomTextIndex(container)`. We do **not** rebuild the index after applying highlights unless the effect re-runs (e.g. `contentHtml` or findings change); when it does, the apply effect runs after and unwraps before applying again. The **build-index** effect now calls `unwrapFindingMarks(container)` before `buildDomTextIndex(container)` so the index is never built over wrapped DOM.
- **Location:** `ScriptWorkspace.tsx` — “Build DOM text index ONLY on unwrapped DOM” effect; `domTextIndex.ts` — `unwrapFindingMarks()`.

## 3. Stronger offset validation (skip + log)

- **Improvement:** `offsetValid(canonical, f)` still returns true only when the normalized slice matches or contains the normalized excerpt. When it returns false we now log (dev only):
  - **Range:** `[ScriptWorkspace] offset invalid (range):` finding id, `{ start, end, contentLen }`
  - **Mismatch:** `[ScriptWorkspace] offset invalid (mismatch):` finding id, `{ start, end, slicePreview, excerptPreview }` (first 60 chars each).
- After filtering, we log: `[ScriptWorkspace] findings skipped by offsetValid: N of M` when any were skipped.
- **Effect:** Findings that would have produced random marks are not highlighted and are visible in the console for debugging.

## 4. Overlapping findings

- **Problem:** `range.surroundContents()` can throw when ranges partially overlap (e.g. second range starts inside an already-wrapped mark).
- **Fix:** Findings are sorted by **start asc, end desc** (longer first for same start). We track `lastEnd` and **skip** any finding whose `start < lastEnd` (overlap with the last applied range), and log: `[ScriptWorkspace] overlap skipped:]` finding id, `{ start, end, lastEnd }`. At the end we log `[ScriptWorkspace] overlaps encountered: N` when any were skipped.
- We do not merge or split ranges; overlapping findings are skipped so that highlights remain stable and no throw occurs.

## Summary: minimal fixes applied

| Issue | Fix |
|-------|-----|
| Normalize drift | Single spec in `NORMALIZE_SPEC.md`; frontend uses `canonicalText.normalizeText` in `domTextIndex`; dev assertion compares canonical vs `domTextIndex.normalizedText`. |
| Index on wrapped DOM | Build-index effect calls `unwrapFindingMarks(container)` before `buildDomTextIndex(container)`. |
| Random marks from bad offsets | Stronger `offsetValid` with dev logs (range + mismatch); findings skipped and count logged. |
| surroundContents throw on overlap | Sort by start asc, end desc; skip finding if `start < lastEnd`; log skipped overlaps. |

## How to use this for debugging

1. **NormalizedText vs canonical:** Check console for “canonical vs dom normalizedText MISMATCH”. If present, lengths (and possibly content) differ — fix normalization or sanitization so they match.
2. **Findings skipped by offsetValid:** Look for “findings skipped by offsetValid: N of M” and “offset invalid (range)” / “offset invalid (mismatch)” to see which findings were dropped and why (slice vs excerpt preview).
3. **Overlaps:** Look for “overlap skipped” and “overlaps encountered” to see how many overlapping ranges were skipped.
4. **Report:** After a run, you can summarize: (a) normalizedText matched canonical? (b) count skipped by offsetValid, (c) count overlaps encountered. That is the alignment debug report for that session.
