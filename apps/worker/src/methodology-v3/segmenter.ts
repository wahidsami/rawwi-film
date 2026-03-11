export type ContextWindow = {
  id: string;
  start: number;
  end: number;
  text: string;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Build stable context windows around candidate evidence spans.
 * The windows are intentionally bounded to avoid full-script token blowups.
 */
export function buildContextWindows(
  fullText: string | null,
  spans: Array<{ start: number; end: number }>,
  radius = 220
): ContextWindow[] {
  if (!fullText || !fullText.length) return [];
  const windows: ContextWindow[] = [];
  for (let i = 0; i < spans.length; i++) {
    const s = clamp(spans[i].start, 0, fullText.length);
    const e = clamp(spans[i].end, s, fullText.length);
    const start = clamp(s - radius, 0, fullText.length);
    const end = clamp(e + radius, start, fullText.length);
    windows.push({
      id: `ctx-${start}-${end}-${i}`,
      start,
      end,
      text: fullText.slice(start, end),
    });
  }
  return windows;
}
