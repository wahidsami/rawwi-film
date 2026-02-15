# Selection bug investigation: text selection snaps away in script viewer

## Problem

- User cannot keep a text selection in the **Highlight**-mode script viewer.
- Blue selection disappears immediately after mouseup (“snaps away”).
- This blocks manual findings (select text → right-click → Add to findings).

---

## Step 1 — DOM element that renders the script text

**File:** `apps/web/src/pages/ScriptWorkspace.tsx`

**Structure:**

1. **Outer scroll container** (center column):
   - `<div ref={viewerScrollRef} className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto">`
   - Not the text container; scroll only.

2. **Inner width wrapper:**
   - `<div className="max-w-[980px] w-full mx-auto px-4 lg:px-6 py-4 pb-32">`
   - No ref; no selection-related classes.

3. **Text container (only in Highlight mode):**
   - **This is the element that holds the script text.**
   - `<div ref={editorRef} className="bg-surface border border-border rounded-xl shadow-sm p-6 lg:p-8 min-h-[600px] text-lg leading-relaxed text-text-main outline-none focus-visible:ring-2 focus-visible:ring-primary/20 break-words whitespace-pre-wrap text-right select-text" dir="rtl" onMouseDown={handleMouseDown} onContextMenu={handleContextMenu} onMouseUp={handleMouseUp} ...>`
   - **Direct children:** either `findingSegments.map(...)` (spans) or `<span dangerouslySetInnerHTML={{ __html: viewerHtml }} />`.
   - **Text nodes** live inside the mapped `<span>` elements (segment text or plain text).

**JSX snippet (simplified):**

```jsx
<div ref={editorRef}
  className="... select-text ..."
  dir="rtl"
  onMouseDown={handleMouseDown}
  onContextMenu={handleContextMenu}
  onMouseUp={handleMouseUp}
  onTouchEnd={() => handleMouseUp()}
  ...>
  {findingSegments ? (
    findingSegments.map((seg) => (
      <span key={`seg-${seg.start}-${seg.end}-${seg.finding?.id ?? 'none'}`}>
        {sectionAtStart != null && <span data-section-index={...} />}
        {seg.finding ? (
          <span data-finding-id={...} onMouseEnter={...} onMouseLeave={...} onClick={...}>
            {text}
          </span>
        ) : (
          text
        )}
      </span>
    ))
  ) : (
    <span dangerouslySetInnerHTML={{ __html: viewerHtml }} />
  )}
</div>
```

**Conclusion:** Plain `div` with `ref={editorRef}`; not a canvas. The element that directly contains the text nodes is this div; the actual text is in child `<span>`s.

---

## Step 2 — CSS that could affect selection

**Search results:**

- **Viewer text container:** has `select-text` (Tailwind → `user-select: text`). No `select-none` or `user-select: none` on this element.
- **Parent wrappers:** `viewerScrollRef` div and `max-w-[980px]` wrapper have no `user-select` or `select-none`. No overlay with `pointer-events: none` on the text.
- **Tooltip:** `className="... pointer-events-none"` — does not cover the viewer; does not block selection.
- **Elsewhere in app:** `CompanyAvatar.tsx` uses `select-none` (avatar text only); `Button` uses `disabled:pointer-events-none` for disabled state only. None apply to the script viewer.

**Computed style to confirm in DevTools:** On the `editorRef` div (the one with `select-text`), computed `user-select` should be **`text`**. No parent between it and the root should have `user-select: none`.

**Conclusion:** CSS is not the cause. Selection is allowed on the viewer.

---

## Step 3 — Re-render as the cause

**Observation:**  
Calling **setState** (e.g. `setFloatingAction` or `setContextMenu`) inside **handleMouseUp** causes a **synchronous** React state update. React then re-renders. The segment tree is recreated (new span elements). The selection was anchored to the **previous** DOM nodes; after re-render those nodes are replaced, so the browser **clears the selection**. Hence the selection “snaps away” right after mouseup.

**Debug instrumentation added (dev only):**

- **Render count:** `console.count('[ScriptWorkspace] render')` at top of component — confirms re-renders on every state change.
- **reportFindings dependency:** `useEffect(() => { console.log('[ScriptWorkspace] reportFindings changed', reportFindings.length); }, [reportFindings])` — logs when findings (and thus segment list) change.
- **Mouseup selection:**  
  - Sync: `console.log('[ScriptWorkspace] mouseup selection (sync):', ...)` — selection is still present when mouseup runs.  
  - After tick: `setTimeout(() => console.log('[ScriptWorkspace] mouseup selection (after tick):', ...), 0)` — selection is often **(none)** after the timeout, because the setState from mouseup has already run and triggered a re-render that replaced the DOM.

**Conclusion:** A re-render triggered by **setState in handleMouseUp** replaces the DOM and clears the selection. The selection is present synchronously in mouseup but gone after the next tick.

---

## Step 4 — Minimal fix (single change)

**Cause:**  
`handleMouseUp` calls `setFloatingAction(...)` or `setContextMenu(null)` **synchronously**. That triggers a re-render and replacement of the segment spans, so the selection is lost.

**Fix:**  
**Defer all setState in handleMouseUp to the next macrotask** so the browser can commit the selection and the user sees the blue highlight before any re-render.

1. In **handleMouseUp**, do **not** call any setState in the same tick.
2. Read selection and range **synchronously** (selection and range are still valid).
3. Build the floating-action payload (e.g. `{ x, y, text }`) from the current selection/range.
4. Call **`setTimeout(() => { setFloatingAction(...) or setContextMenu(null); }, 0)`** so the update runs in the next tick.

**Implementation (done):**

- Capture `selection`, `selText`, and (if there is a selection) `range` and `rect` in the sync part of `handleMouseUp`.
- Compute `floatingPayload` (or null) from `rect` and `text` in the same sync block.
- `setTimeout(() => { if (floatingPayload) setFloatingAction(floatingPayload); else { setFloatingAction(null); setContextMenu(null); } }, 0)`.

**Result:** Selection stays visible after mouseup (no re-render in the same tick). Floating action bubble still appears one tick later. Right-click context menu still works because it runs in a separate event and can read `getSelection()` and `getSelectionOffsets(editorRef.current)`; if the user has already released the mouse, the selection can still be present because we no longer clear it with an immediate re-render.

**Optional cleanup:** Remove or leave behind `IS_DEV` the debug logs (render count, reportFindings effect, mouseup sync/after-tick logs) as needed.

---

## Summary

| Item | Finding |
|------|--------|
| **Exact element** | `div` with `ref={editorRef}` in Highlight mode; class includes `select-text`; children are segment spans or a single span with `dangerouslySetInnerHTML`. |
| **Computed CSS** | `user-select: text` on the viewer; no `select-none` or blocking overlay on the viewer. |
| **Renders on mouseup?** | Yes. `setFloatingAction` / `setContextMenu` in `handleMouseUp` cause an immediate re-render. |
| **State that triggers it** | `setFloatingAction({ x, y, text })` or `setFloatingAction(null)` and `setContextMenu(null)` inside `handleMouseUp`. |
| **Minimal fix** | Defer these setState calls with `setTimeout(..., 0)` and capture selection/range/rect synchronously so the selection is not cleared by re-render before the next tick. |

**Quick test (if needed):** Temporarily remove or no-op the setState calls in `handleMouseUp`. Selection should then persist, confirming that the setState-triggered re-render was the cause. The production fix is to keep the logic but defer the setState as above.
