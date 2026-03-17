# Script offsets and page numbers

## Canonical content

- **`script_text.content`** is the single string used for analysis and for `start_offset_global` / `end_offset_global` on findings.
- When the script was imported **per page** (`script_pages` rows exist), that content is the concatenation of each page’s `content` field in **ascending `page_number` order**.

## Separator between pages

The separator is **exactly two characters: newline + newline** (`\n\n`, length **2**).

This **must** match:

- [`supabase/functions/extract/index.ts`](../supabase/functions/extract/index.ts) — `PAGE_SEP = "\n\n"` when joining normalized page parts into `script_text.content`.
- [`apps/web/src/utils/documentExtract.ts`](../apps/web/src/utils/documentExtract.ts) — `PAGE_SEPARATOR = '\n\n'` for PDF multi-page joins.
- Any code that maps a global offset to a page (findings API, worker, chunk page span).

If you change the separator in one place, update **all** of the above and this document.

## Mapping offset → page

1. Load `script_pages` for the version, ordered by `page_number`.
2. Walk pages in order, maintaining cumulative start index `start`:
   - Page covers offsets `[start, start + len(content) + 2)` (the `+2` assigns the inter-page `\n\n` to the **previous** page for boundary purposes, matching manual-finding logic).
3. The first page whose range contains `start_offset_global` yields `page_number`.

Shared implementations:

- Edge: [`supabase/functions/_shared/offsetToPage.ts`](../supabase/functions/_shared/offsetToPage.ts)
- Worker: [`apps/worker/src/offsetToPage.ts`](../apps/worker/src/offsetToPage.ts)

## No per-page rows

If there are **no** `script_pages` for a version, `page_number` on findings and chunk page spans should remain **null** (single-scroll / legacy scripts).

## Optional: `ANALYSIS_CHUNK_BY_PAGE`

When set to `true` on Supabase Edge Functions (e.g. `tasks`, `extract` ingest), analysis chunks are built by **merging consecutive script pages** up to the usual max size (~12k chars), instead of fixed sliding windows with overlap. This makes chunk indices align more closely with document pages. Default is off (empty/false).
