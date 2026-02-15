/**
 * DOM text index: map between canonical (normalized) plain-text offsets and DOM positions.
 * Used for applying AI/manual finding highlights in the formatted HTML viewer and
 * converting user selection to canonical offsets.
 * Uses canonicalText.normalizeText so normalizedText matches script_text.content exactly.
 */
import { normalizeText } from './canonicalText';

export type TextSegment = { node: Text; text: string };

/**
 * Collect text nodes in DOM order (TreeWalker SHOW_TEXT).
 */
/**
 * Unwrap all [data-finding-id] marks inside container (replace each with its children).
 * Call before building the DOM index so the index is built on clean DOM only.
 */
export function unwrapFindingMarks(container: Node): void {
  const root = container instanceof Document ? container.body : container;
  if (!root || !('querySelectorAll' in root)) return;
  (root as Element).querySelectorAll('[data-finding-id]').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    if (el.parentNode === parent) parent.removeChild(el);
  });
}

export function collectTextNodes(container: Node): TextSegment[] {
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? '';
    if (text.length > 0) segments.push({ node, text });
  }
  return segments;
}

/**
 * Build index: normalized text from container + mappings for offset <-> DOM.
 * normalizedText is the same string as script_text.content (canonical).
 */
export type DomTextIndex = {
  normalizedText: string;
  segments: TextSegment[];
  /** For each normalized index 0..normalizedText.length, (node, offsetInNode) for start of that character */
  normToDom: Array<{ node: Text; offset: number }>;
  /** rawOffset -> normalized index (rawOffset in 0..rawText.length) */
  rawToNorm: number[];
  /** Get normalized index for (node, offsetInNode). Returns -1 if not found. */
  getNormalizedIndex(node: Node, offsetInNode: number): number;
  /** Get normalized index for a raw character offset (sum of preceding text node lengths + offset in node). */
  getNormalizedIndexFromRawOffset(rawOffset: number): number;
};

export function buildDomTextIndex(container: Node): DomTextIndex | null {
  const segments = collectTextNodes(container);
  if (segments.length === 0) return null;
  const rawText = segments.map((s) => s.text).join('');
  const normalizedText = normalizeText(rawText);
  if (normalizedText.length === 0) return null;

  const normToDom: Array<{ node: Text; offset: number }> = [];
  const rawToNorm: number[] = new Array(rawText.length + 1);
  let normIdx = 0;
  let rawIdx = 0;
  let inWhitespace = false;
  const nodeToNormArrays = new Map<Node, number[]>();

  for (const { node, text } of segments) {
    const arr: number[] = [];
    for (let i = 0; i <= text.length; i++) {
      rawToNorm[rawIdx] = normIdx;
      arr[i] = normIdx;
      if (i < text.length) {
        const c = text[i];
        const isSpace = /\s/.test(c);
        if (isSpace) {
          if (!inWhitespace) {
            normToDom[normIdx] = { node, offset: i };
            normIdx++;
            inWhitespace = true;
          }
        } else {
          normToDom[normIdx] = { node, offset: i };
          normIdx++;
          inWhitespace = false;
        }
        rawIdx++;
      }
    }
    nodeToNormArrays.set(node, arr);
  }
  rawToNorm[rawIdx] = normIdx;
  const last = segments[segments.length - 1];
  if (last) normToDom[normalizedText.length] = { node: last.node, offset: last.text.length };

  function getNormalizedIndex(node: Node, offsetInNode: number): number {
    const arr = nodeToNormArrays.get(node);
    if (arr == null) return -1;
    if (offsetInNode <= 0) return arr[0] ?? -1;
    if (offsetInNode >= arr.length) return arr[arr.length - 1] ?? -1;
    return arr[offsetInNode] ?? -1;
  }

  function getNormalizedIndexFromRawOffset(rawOffset: number): number {
    if (rawOffset <= 0) return 0;
    if (rawOffset >= rawToNorm.length) return rawToNorm[rawToNorm.length - 1] ?? 0;
    return rawToNorm[rawOffset] ?? 0;
  }

  return { normalizedText, segments, normToDom, rawToNorm, getNormalizedIndex, getNormalizedIndexFromRawOffset };
}

/**
 * Create a DOM Range covering the normalized span [startNorm, endNorm).
 * Returns null if indices are out of range or span is invalid.
 */
export function rangeFromNormalizedOffsets(
  index: DomTextIndex | null,
  startNorm: number,
  endNorm: number
): Range | null {
  if (index == null || startNorm < 0 || endNorm <= startNorm) return null;
  const { normToDom } = index;
  if (startNorm >= normToDom.length) return null;
  const startDom = normToDom[startNorm];
  const endEntry = endNorm <= normToDom.length - 1 ? normToDom[endNorm] : normToDom[normToDom.length - 1];
  if (!startDom || !endEntry) return null;
  const range = document.createRange();
  try {
    range.setStart(startDom.node, startDom.offset);
    range.setEnd(endEntry.node, endEntry.offset);
  } catch {
    return null;
  }
  return range;
}

/**
 * Get raw character offset for (textNode, offsetInNode). Returns -1 if node not in segments.
 */
function getRawOffset(segments: TextSegment[], textNode: Node, offsetInNode: number): number {
  let raw = 0;
  for (const { node, text } of segments) {
    if (node === textNode) return raw + Math.min(offsetInNode, text.length);
    raw += text.length;
  }
  return -1;
}

/**
 * Get canonical (normalized) start and end offsets from the current selection.
 * Selection must be inside container; supports text node boundaries (element boundaries not supported).
 */
export function selectionToNormalizedOffsets(
  index: DomTextIndex | null,
  selection: Selection | null,
  container: Node
): { start: number; end: number } | null {
  if (index == null || !selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;
  if (startNode.nodeType !== Node.TEXT_NODE || endNode.nodeType !== Node.TEXT_NODE) return null;
  const rawStart = getRawOffset(index.segments, startNode, startOffset);
  const rawEnd = getRawOffset(index.segments, endNode, endOffset);
  if (rawStart < 0 || rawEnd < 0) return null;
  const startNorm = index.getNormalizedIndexFromRawOffset(rawStart);
  const endNorm = index.getNormalizedIndexFromRawOffset(rawEnd);
  return { start: Math.min(startNorm, endNorm), end: Math.max(startNorm, endNorm) };
}
