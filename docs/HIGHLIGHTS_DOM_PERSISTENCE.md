# Highlights DOM Persistence

## Problem

- Console showed: `[Highlights] total=50 applied=23 ...` (surroundContents succeeded for 23 findings).
- DevTools Elements search for `data-finding-id` returned **0 of 0**.
- Conclusion: highlight wrappers were inserted into the DOM but then **removed**; they were not present in the live DOM.

## 1) Root cause: React re-writing innerHTML

The script viewer renders the formatted HTML in a div with:

```jsx
<div ref={editorRef} dangerouslySetInnerHTML={{ __html: sanitizeFormattedHtml(editorData.contentHtml) }} ... />
```

**What happens:**

1. Highlight effect runs: unwraps old marks, builds ranges, calls `range.surroundContents(span)` for each finding → DOM gains many `<span data-finding-id="...">` nodes.
2. Any state update (tooltip hover, selection, sidebar tab switch, report selection, etc.) causes a re-render.
3. On commit, React reconciles the div. Because `dangerouslySetInnerHTML` is still a prop, React **sets the div’s innerHTML again** to the same (or current) value.
4. Setting `innerHTML` **replaces the entire subtree**, so all DOM mutations (the highlight spans) are wiped.

So the target container was correct (`editorRef.current`), but **React was resetting its content on every re-render**, so highlights disappeared immediately or after the next interaction.

### Container identity (diagnostics added)

In the highlight effect (DEV only), we now log at **start** and **end**:

- **Start:** `container.tagName`, `id`, `className` (first 80 chars), `childElementCount`, `innerText.length`.
- **End:** same plus `container.querySelectorAll('[data-finding-id]').length` (DOM marks count).

This confirms the container node and that marks exist in the DOM at the end of the effect. If marks were 0 after apply, the next step was to confirm that a later re-render was overwriting the div (which we did).

## 2) Render paths that overwrite the viewer HTML

| Trigger | Effect |
|--------|--------|
| **dangerouslySetInnerHTML** on the editor div | React re-applies it on every commit that touches that tree. Any state update (e.g. `setTooltipFinding`, `setSelectedFindingId`, `setSidebarTab`, `setReportFindings`, `setSelectedReportForHighlights`) can cause a commit and thus reset innerHTML. |
| Conditional branch `editorData?.contentHtml ? <div ... /> : <div>plain</div>` | Only switches between HTML and plain viewer; the wipe is from innerHTML, not from swapping the node. |

So the only source of overwrite was **React re-applying `dangerouslySetInnerHTML`** on the same div after our DOM mutations.

## 3) Fix: stop React from owning the div content (approach A)

**Idea:** Set the editor div’s content **only when `contentHtml` actually changes**, via an effect and direct DOM write. React must **not** set `innerHTML` on that div so it never overwrites our highlight spans.

**Implementation:**

1. **Ref to track last set content**  
   `editorContentHtmlSetRef` holds the `contentHtml` string we last wrote. We only write when `editorData?.contentHtml !== editorContentHtmlSetRef.current`.

2. **Effect: set innerHTML only when content changes**  
   - When `editorData?.contentHtml` is null/undefined: clear the ref and clear `container.innerHTML`.  
   - When `editorData?.contentHtml` is set and different from `editorContentHtmlSetRef.current`: set `editorRef.current.innerHTML = sanitizeFormattedHtml(editorData.contentHtml)` and update the ref.  
   - Dependency: `[editorData?.contentHtml]`. So we run only when the script/version content changes (e.g. new import), not on every re-render.

3. **Remove `dangerouslySetInnerHTML` from the div**  
   The HTML viewer div is now rendered **without** `dangerouslySetInnerHTML`. Content is set only in the effect above. React never writes to the div’s innerHTML, so it never removes the highlight spans.

4. **Existing flow unchanged**  
   - “Build DOM text index” effect still runs when `editorData?.contentHtml` changes (after our effect has set innerHTML).  
   - Highlight effect still runs when `domTextIndex` / `reportFindings` / etc. change; it mutates the same container.  
   - Event handlers (mouse, click) stay on the div; no need for an overlay.

**Result:** Highlights are plain DOM mutations (wrap/unwrap). No React prop resets the div content, so `[data-finding-id]` nodes persist across re-renders (tooltip, selection, sidebar, tabs).

## 4) Acceptance

- **Click Highlight** → Elements search finds many `data-finding-id` nodes.
- **Highlights remain visible** after:
  - Hovering tooltips (setTooltipFinding),
  - Selecting text,
  - Opening/closing sidebar,
  - Switching tabs (Findings / Reports).
- Console shows `[Highlights] DOM marks count:` equal to (or close to) `applied`, and “container at end” shows the same count.
- No random disappearance of highlights.

## Follow-up: highlights disappearing when selecting text or opening "Add finding" modal

Another effect was wiping highlights: **"Build DOM text index"** ran with dependency `[editorData?.contentHtml]` and called `unwrapFindingMarks(container)` before building the index. That removed all `[data-finding-id]` spans. Although the effect is only intended to run when `contentHtml` changes, to avoid any re-run (or strict-mode double run) from removing highlights, we **removed `unwrapFindingMarks` from the build effect**. The index is built from the current DOM (with or without highlights); `buildDomTextIndex` only walks text nodes, so it remains correct. Unwrap is now done only inside the **highlight effect** right before re-applying spans, so highlights are never cleared by the build effect.

## Files changed

- **`apps/web/src/pages/ScriptWorkspace.tsx`**
  - Added `editorContentHtmlSetRef` to remember last written `contentHtml`.
  - Added effect that sets `editorRef.current.innerHTML` only when `editorData?.contentHtml` changes (and clears when it becomes null).
  - Removed `dangerouslySetInnerHTML` from the HTML viewer div.
  - **Build DOM text index effect:** no longer calls `unwrapFindingMarks` (only the highlight effect unwraps, before re-applying).
  - Added DEV logs: container identity at highlight-apply start/end and DOM marks count at end.
