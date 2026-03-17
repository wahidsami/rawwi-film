/**
 * Maps global offsets in script_text.content to viewer page numbers.
 * Must match docs/OFFSETS_AND_PAGES.md and supabase/functions/_shared/offsetToPage.ts
 */
export const VIEWER_PAGE_SEP_LEN = 2;

export type ViewerPageSlice = { pageNumber: number; content: string };

/** 1-based page where global offset falls (canonical = page1 + \n\n + page2 + …). */
export function viewerPageNumberFromStartOffset(
  pages: ViewerPageSlice[],
  offset: number | null | undefined
): number | null {
  if (offset == null || !Number.isFinite(offset) || offset < 0 || !pages.length) return null;
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  let start = 0;
  for (const p of sorted) {
    const len = (p.content ?? '').length;
    if (offset >= start && offset < start + len + VIEWER_PAGE_SEP_LEN) return p.pageNumber;
    start += len + VIEWER_PAGE_SEP_LEN;
  }
  return sorted[sorted.length - 1]?.pageNumber ?? null;
}

export function globalStartOfViewerPage(pagesSorted: Array<{ content: string }>, pageZeroBasedIndex: number): number {
  let g = 0;
  for (let i = 0; i < pageZeroBasedIndex; i++) {
    g += (pagesSorted[i]?.content ?? '').length + VIEWER_PAGE_SEP_LEN;
  }
  return g;
}

export function displayPageForFinding(
  startOffsetGlobal: number | null | undefined,
  pages: ViewerPageSlice[] | null | undefined,
  dbPageNumber: number | null | undefined
): number | null {
  if (pages && pages.length > 0 && startOffsetGlobal != null) {
    const v = viewerPageNumberFromStartOffset(pages, startOffsetGlobal);
    if (v != null) return v;
  }
  if (dbPageNumber != null && dbPageNumber > 0 && Number.isFinite(dbPageNumber)) return dbPageNumber;
  return null;
}
