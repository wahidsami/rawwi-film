# Plan: A4 workspace page + higher format fidelity (import)

**Goal:** Move the script workspace from a generic scroll/card toward an **A4-like reading surface** and, where feasible, **closer alignment** with source document typography and spacing—without breaking analysis offsets or page boundaries.

**Constraints:**

- Canonical text for analysis stays **`script_text.content`** (concatenated pages); page splits must stay aligned with current `script_pages` / offset rules ([OFFSETS_AND_PAGES.md](./OFFSETS_AND_PAGES.md)).
- Full pixel-perfect Word/PDF replication in the browser is **not** realistic; phases below scope **good enough** for reviewers.

---

## Phase 1 — A4 page frame in the workspace (layout only)

**Objective:** Each workspace “page” is visually framed like **A4** (portrait), centered, with sensible margins—**content unchanged**.

| Task | Detail |
|------|--------|
| 1.1 | Define CSS **A4 aspect** for page mode: e.g. `width: min(100%, 210mm)` or fixed px ratio (210/297), `min-height` from A4 at 96dpi (~794×1123px) or use `aspect-ratio: 210/297`. |
| 1.2 | **Shadow + margin** so the page reads as a sheet; optional light background outside the sheet. |
| 1.3 | **Zoom** should scale the whole page frame (existing zoom may already scale content—align with A4 wrapper). |
| 1.4 | **Print / “Print page”** (optional): `@media print` single page per sheet for current page or full script. |
| 1.5 | **Mobile:** below breakpoint, fall back to full-width card (no fake A4) or scaled-down sheet. |

**Exit:** Page mode shows one logical page inside an A4-shaped viewport; PDF/DOCX page index still 1:1.

**Files (likely):** `ScriptWorkspace.tsx`, `index.css` or workspace-scoped CSS module.

**Risk:** Low. No backend change.

---

## Phase 2 — Typography tokens inside the A4 frame (readability, not Word clone)

**Objective:** Consistent **script reading** typography inside the sheet (size, line-height, paragraph gap)—optionally **match common screenplay norms** (e.g. 12pt equivalent, double-spacing feel).

| Task | Detail |
|------|--------|
| 2.1 | Move from ad-hoc `text-lg leading-relaxed` to **tokens**: `--script-font-size`, `--script-line-height`, `--script-paragraph-gap` on `.script-import-body` inside the A4 wrapper. |
| 2.2 | **Settings** (optional): user or org default “compact / standard / screenplay”. |
| 2.3 | Keep **Cairo** as default Arabic UI font unless Phase 4 adds “use source font when available.” |

**Exit:** Spacing feels intentional and stable across pages; still not identical to Word.

**Risk:** Low.

---

## Phase 3 — DOCX: richer structure preservation (Mammoth + post-process)

**Objective:** Improve **semantic** fidelity: styles Mammoth already maps weakly; normalize lists, scene headings, character cues if patterns exist.

| Task | Detail |
|------|--------|
| 3.1 | Audit Mammoth options (`styleMap`) for **custom Word styles** → HTML classes (e.g. `Scene Heading` → `<p class="scene-heading">`). |
| 3.2 | Post-process HTML: strip empty spans, normalize `strong`/`em`, optional **RTL** wrappers where missing. |
| 3.3 | **Per-page HTML** already split by anchors; ensure new classes survive split. |
| 3.4 | (Optional) **Toggle “preserve DOCX font family”** for non-Arabic scripts only, or second theme—conflicts with global Cairo; product decision. |

**Exit:** More predictable heading/paragraph styling; optional style map for client templates.

**Files:** `documentExtract.ts`, Mammoth config, `sanitizeFormattedHtml` if needed.

**Risk:** Medium (regex/styleMap maintenance).

---

## Phase 4 — PDF: structure + light styling from `getTextContent()`

**Objective:** Beyond plain text: **paragraphs**, optional **bold** when font name suggests it.

| Task | Detail |
|------|--------|
| 4.1 | Use PDF.js item stream: group by **Y** position → lines → paragraphs; emit `<p>` or `\n\n` consistently with current normalization. |
| 4.2 | If `item.fontName` includes `Bold` / weight metadata, wrap runs in `<strong>`. |
| 4.3 | Store **per-page HTML** in `script_pages.content_html` for PDF imports (today may be plain only). |
| 4.4 | Fallback: plain text if extraction fails. |

**Exit:** PDF pages in workspace show basic structure + some emphasis.

**Files:** `documentExtract.ts` (PDF path), extract API persistence.

**Risk:** Medium–high (PDFs vary wildly; lots of QA).

---

## Phase 5 — Optional: true layout fidelity paths (later / niche)

| Approach | Use case |
|----------|----------|
| **Render PDF page as image** (canvas) per page | Pixel-perfect “what PDF looks like”; **no** text select/analysis on image unless OCR—usually **not** desired for your pipeline. |
| **Office Online / third-party DOCX viewer** | Full Word layout; licensing, security, offline. |
| **Server-side PDF→HTML** | Heavy infra; variable quality. |

**Recommendation:** Defer unless a client **requires** visual parity over selectable text.

---

## Suggested order

| Order | Phase | Effort | Value |
|-------|-------|--------|--------|
| 1 | Phase 1 A4 frame | S | High UX |
| 2 | Phase 2 typography tokens | S | High readability |
| 3 | Phase 3 DOCX styleMap | M | Medium |
| 4 | Phase 4 PDF HTML | L | Medium for PDF-heavy workflows |
| 5 | Phase 5 | — | Only on demand |

---

## Dependencies

- Phase 1–2: frontend only.
- Phase 3–4: import pipeline + possibly migration if `content_html` for PDF pages grows.
- QA: same scripts in Quick Analysis vs client script (both use same extract path).

---

## Open product questions

1. **A4 only in page mode**, or also for single-scroll HTML view?
2. **Cairo mandatory** vs **optional “source font”** for Latin stage directions?
3. **Print** parity required for regulators (Phase 1.4)?

---

## Implementation status (done)

| Phase | Status | Notes |
|-------|--------|--------|
| **1** | Done | Page mode: `.workspace-a4-stage` + `.workspace-a4-sheet` (210×297mm), zoom on `.workspace-a4-zoom-inner` (`transformOrigin: top center`). Mobile: narrower padding / full width. |
| **2** | Done | Tokens `--script-sheet-font-size`, `--script-sheet-line-height`, `--script-sheet-para-gap` on sheet-wrapped `.script-import-body`. |
| **3** | Done | `mammothDocxStyles.ts` + `styleMap` on all Mammoth `convertToHtml` paths; CSS for `.script-scene-heading`, `.script-character`, `.script-dialogue`, titles, etc. |
| **4** | Done | `extractTextFromPdfPerPage` returns `html` per page (lines + `<strong>` from font name); `ScriptWorkspace` / `QuickAnalysis` send `pages[].html` to extract. |
| **1.4 Print** | Open | Existing `@media print` A4; per-page print not added. |
| **2.2 Settings** | Open | No compact/standard UI toggle yet. |

*Last updated: Phases 1–4 implemented in web + `documentExtract`.*
