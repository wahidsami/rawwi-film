import { VIEWER_PAGE_SEP_LEN, type ViewerPageSlice } from './viewerPageFromOffset';

export type ResolvedSceneLabel = {
  heading: string;
  kind: 'scene' | 'chapter' | 'section';
  sceneIndex: number;
};

const sceneIndexCache = new WeakMap<ViewerPageSlice[], ResolvedSceneLabelWithOffset[]>();

type ResolvedSceneLabelWithOffset = ResolvedSceneLabel & {
  startOffset: number;
};

function normalizeHeading(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function isLikelySceneHeading(line: string): boolean {
  const trimmed = normalizeHeading(line);
  if (!trimmed) return false;
  if (trimmed.length > 96) return false;
  if (/:/.test(trimmed)) return false;

  if (/^(?:المشهد|مشهد)\s*[\d\u0660-\u0669]+/u.test(trimmed)) return true;
  if (/^(?:INT\.|EXT\.|I\/E\.|INT\/EXT|\.INT|\.EXT)\b/i.test(trimmed)) return true;
  if (/^(?:[.٠-٩0-9]+\s+)?(?:المشهد|مشهد|الفصل|الطريق|منزل|سيارة)\b/u.test(trimmed)) return true;
  if (
    /(?:\bداخلي\b|\bخارجي\b|\/ليلي|\/نهاري|- خارجي|- داخلي|-خارجي|-داخلي)/u.test(trimmed) &&
    !/[.!؟،؛]/u.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function detectHeadingKind(heading: string): ResolvedSceneLabel['kind'] {
  if (/^\s*(?:الفصل|chapter)\b/iu.test(heading)) return 'chapter';
  if (/^\s*(?:المشهد|مشهد|scene|int\.|ext\.|i\/e\.|int\/ext|\.int|\.ext)\b/iu.test(heading)) return 'scene';
  return 'section';
}

function buildSceneIndex(pages: ViewerPageSlice[]): ResolvedSceneLabelWithOffset[] {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const fullText = sorted.map((page) => page.content ?? '').join('\n\n');
  const headings: ResolvedSceneLabelWithOffset[] = [];

  let cursor = 0;
  let sceneIndex = 0;
  for (const rawLine of fullText.split(/\r?\n/)) {
    const heading = normalizeHeading(rawLine);
    if (isLikelySceneHeading(heading)) {
      sceneIndex += 1;
      headings.push({
        heading,
        kind: detectHeadingKind(heading),
        sceneIndex,
        startOffset: cursor,
      });
    }
    cursor += rawLine.length + 1;
  }

  return headings;
}

function getCachedSceneIndex(pages: ViewerPageSlice[] | null | undefined): ResolvedSceneLabelWithOffset[] {
  if (!pages || pages.length === 0) return [];
  const cached = sceneIndexCache.get(pages);
  if (cached) return cached;
  const built = buildSceneIndex(pages);
  sceneIndexCache.set(pages, built);
  return built;
}

export function resolveSceneLabelFromOffset(
  startOffsetGlobal: number | null | undefined,
  pages: ViewerPageSlice[] | null | undefined,
): ResolvedSceneLabel | null {
  if (startOffsetGlobal == null || !Number.isFinite(startOffsetGlobal) || startOffsetGlobal < 0) return null;
  const headings = getCachedSceneIndex(pages);
  if (headings.length === 0) return null;

  let resolved: ResolvedSceneLabelWithOffset | null = null;
  for (const heading of headings) {
    if (heading.startOffset > startOffsetGlobal + VIEWER_PAGE_SEP_LEN) break;
    resolved = heading;
  }

  if (!resolved) return null;
  return {
    heading: resolved.heading,
    kind: resolved.kind,
    sceneIndex: resolved.sceneIndex,
  };
}

export function formatResolvedSceneLabel(
  scene: ResolvedSceneLabel | null,
  lang: 'ar' | 'en',
): string | null {
  if (!scene) return null;
  return lang === 'ar'
    ? `المشهد/الفصل: ${scene.heading}`
    : `Scene/Section: ${scene.heading}`;
}
