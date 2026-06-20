import { findBestMatch, findTextOccurrences } from './textMatching';

export type ViewerPageSlice = { pageNumber: number; content: string };

function normalizeLooseText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimSentenceText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([،,.!?؟؛:])/g, '$1')
    .replace(/([،,.!?؟؛:])\s+/g, '$1 ')
    .trim();
}

function isSentenceBoundaryChar(ch: string): boolean {
  return /[.!?؟؛\n\r]/.test(ch);
}

function extractSentenceAroundMatch(content: string, start: number, end: number): string | null {
  if (!content || start < 0 || end <= start) return null;

  let left = start;
  while (left > 0 && !isSentenceBoundaryChar(content[left - 1]!)) {
    left--;
  }

  let right = end;
  while (right < content.length && !isSentenceBoundaryChar(content[right]!)) {
    right++;
  }

  let sentence = trimSentenceText(content.slice(left, right));
  if (!sentence) return null;

  if (sentence.length > 240) {
    const windowStart = Math.max(0, start - 80);
    const windowEnd = Math.min(content.length, end + 120);
    sentence = trimSentenceText(content.slice(windowStart, windowEnd));
  }

  if (sentence.length > 260) {
    sentence = `${sentence.slice(0, 257).trimEnd()}…`;
  }

  return sentence || null;
}

function resolvePageContent(
  viewerPages: ViewerPageSlice[] | null | undefined,
  pageNumber: number | null | undefined
): string | null {
  const pages = viewerPages ?? [];
  if (pages.length === 0) return null;
  if (pageNumber != null && Number.isFinite(pageNumber)) {
    const direct = pages.find((page) => page.pageNumber === pageNumber);
    if (direct?.content) return direct.content;
  }
  return null;
}

export function getGlossarySentenceContext(params: {
  evidenceSnippet?: string | null;
  pageNumber?: number | null;
  startOffsetGlobal?: number | null;
  viewerPages?: ViewerPageSlice[] | null;
}): string | null {
  const snippet = normalizeLooseText(params.evidenceSnippet ?? '');
  const pages = params.viewerPages ?? [];
  if (!snippet || pages.length === 0) return null;

  const candidatePages: ViewerPageSlice[] = [];
  const directPage = resolvePageContent(pages, params.pageNumber);
  if (directPage) {
    candidatePages.push({ pageNumber: params.pageNumber ?? 0, content: directPage });
  }
  for (const page of pages) {
    if (candidatePages.some((candidate) => candidate.pageNumber === page.pageNumber)) continue;
    candidatePages.push(page);
  }

  for (const page of candidatePages) {
    const exactIdx = page.content.indexOf(snippet);
    const matches = exactIdx >= 0
      ? [{ start: exactIdx, end: exactIdx + snippet.length, text: snippet, confidence: 1 }]
      : findTextOccurrences(page.content, snippet, { minConfidence: 1 });
    const best = findBestMatch(matches, params.startOffsetGlobal ?? undefined);
    if (!best) continue;

    const sentence = extractSentenceAroundMatch(page.content, best.start, best.end);
    if (sentence) return sentence;
  }

  return null;
}
