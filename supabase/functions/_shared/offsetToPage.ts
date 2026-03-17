/**
 * Maps global offsets in script_text.content to script page numbers.
 * See docs/OFFSETS_AND_PAGES.md — separator between pages is always "\n\n" (length 2).
 */

export const SCRIPT_PAGE_SEPARATOR = "\n\n";
export const SCRIPT_PAGE_SEP_LEN = SCRIPT_PAGE_SEPARATOR.length;

export type ScriptPageRow = { page_number: number; content: string };

export function offsetToPageNumber(
  offset: number,
  pageRows: ScriptPageRow[]
): number | null {
  if (pageRows.length === 0 || offset < 0 || !Number.isFinite(offset)) return null;
  const sorted = [...pageRows].sort((a, b) => a.page_number - b.page_number);
  let start = 0;
  for (const row of sorted) {
    const len = row.content?.length ?? 0;
    const end = start + len;
    if (offset >= start && offset < end + SCRIPT_PAGE_SEP_LEN) {
      return row.page_number;
    }
    start = end + SCRIPT_PAGE_SEP_LEN;
  }
  return null;
}

export function globalOffsetForPageStart(pageNumber: number, pageRows: ScriptPageRow[]): number | null {
  const sorted = [...pageRows].sort((a, b) => a.page_number - b.page_number);
  let g = 0;
  for (const row of sorted) {
    if (row.page_number === pageNumber) return g;
    g += (row.content?.length ?? 0) + SCRIPT_PAGE_SEP_LEN;
  }
  return null;
}

export function computePageLocalSpan(
  startG: number,
  endG: number,
  pageRows: ScriptPageRow[]
): { start_offset_page: number | null; end_offset_page: number | null } {
  if (pageRows.length === 0 || endG <= startG) {
    return { start_offset_page: null, end_offset_page: null };
  }
  const pn = offsetToPageNumber(startG, pageRows);
  if (pn == null) return { start_offset_page: null, end_offset_page: null };
  const g0 = globalOffsetForPageStart(pn, pageRows);
  if (g0 == null) return { start_offset_page: null, end_offset_page: null };
  const row = pageRows.find((r) => r.page_number === pn);
  const plen = row?.content?.length ?? 0;
  const ls = Math.max(0, startG - g0);
  const le = Math.min(plen, endG - g0);
  if (le <= ls) return { start_offset_page: null, end_offset_page: null };
  return { start_offset_page: ls, end_offset_page: le };
}

/** Min/max page touched by [startOffset, endOffsetExclusive) in canonical content. */
export function offsetRangeToPageMinMax(
  startOffset: number,
  endOffsetExclusive: number,
  pageRows: ScriptPageRow[]
): { pageNumberMin: number | null; pageNumberMax: number | null } {
  if (pageRows.length === 0) {
    return { pageNumberMin: null, pageNumberMax: null };
  }
  const min = offsetToPageNumber(startOffset, pageRows);
  const last = Math.max(startOffset, endOffsetExclusive - 1);
  const max = offsetToPageNumber(last, pageRows);
  return { pageNumberMin: min, pageNumberMax: max ?? min };
}
