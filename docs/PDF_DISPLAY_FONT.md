# PDF → workspace font (display hint)

## What we can and cannot do

| Approach | Feasibility |
|----------|-------------|
| **Read font names from PDF text runs** (pdf.js `getTextContent()` → `fontName`) | Yes — often `/BaseFont`–like strings, sometimes opaque ids (`g_d0_f1`). |
| **Map those names to a web `font-family` stack** (Traditional Arabic, Amiri, Arial, …) | Yes — heuristic table in `apps/web/src/utils/pdfDisplayFont.ts`. |
| **Use the exact embedded subset from the PDF in CSS** | Hard — requires font binary extraction, licensing checks, and `@font-face` payloads; out of scope for the default product path. |
| **Pixel-match the PDF** | Use **Original PDF** view; extracted text is Unicode + HTML, not guaranteed WYSIWYG. |

## What we implemented

1. **At import** (`extractTextFromPdfPerPage`): compute **dominant** `fontName` per page (weighted by extracted string length), map to a **CSS stack** with Arabic/Latin fallbacks ending in **Cairo** where needed.
2. **Persist** `script_pages.display_font_stack` (nullable) via **POST /extract** `pages[].displayFontStack`.
3. **Workspace** (`ScriptWorkspace`): in **page mode**, `style.fontFamily` uses the current page’s stack; otherwise **`DEFAULT_SCRIPT_EDITOR_FONT_STACK`** (`Cairo`, `Segoe UI`, …).

## Operations

- Run migration `20260323100000_script_pages_display_font_stack.sql`.
- Redeploy **extract** Edge Function and **scripts** (editor GET already selects the column).
- **Re-import** PDFs to backfill stacks; old rows stay `null` → Cairo default.

## Extending the mapper

Add rows to the `rules` array in `mapPdfFontNameToCssStack()` when you see new PDF producer names in DevTools (log `dominantPdfFontName` during dev if needed). Prefer **system + Google** fonts users are likely to have; keep **Cairo** in the stack as a safe Arabic fallback.
