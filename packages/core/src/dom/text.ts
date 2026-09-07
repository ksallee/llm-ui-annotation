import type { Rect, TextTarget } from '../model/types.js';
import { isOverlay } from './ancestors.js';
import { compactRefs, describeElement, type DescribeOptions } from './describe.js';
import { clientRectsOf, mergeLineRects } from './rect.js';
import { resolveSelector } from './selector.js';

const CONTEXT_CHARS = 32;
const FUZZY_HEAD = 30;
const FUZZY_MIN = 12;
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'section',
  'article', 'dd', 'dt', 'figcaption', 'summary',
]);
const BLOCK_DISPLAY = new Set(['block', 'list-item', 'table-cell']);

export interface Normalized {
  text: string;
  /** Raw index of the character at `normIndex`. */
  map: (normIndex: number) => number;
}

function normalizeWithIndices(raw: string): { text: string; indices: number[] } {
  let text = '';
  const indices: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (/\s/.test(raw[i] as string)) {
      const start = i;
      while (i < raw.length && /\s/.test(raw[i] as string)) i += 1;
      if (text.length > 0 && i < raw.length) {
        text += ' ';
        indices.push(start);
      }
      continue;
    }
    text += raw[i];
    indices.push(i);
    i += 1;
  }
  return { text, indices };
}

/** Whitespace runs collapsed to one space and trimmed, with a map back to raw offsets. */
export function normalize(raw: string): Normalized {
  const { text, indices } = normalizeWithIndices(raw);
  return { text, map: (n) => indices[n] ?? raw.length };
}

interface Piece {
  node: Text;
  start: number;
  end: number;
}

export interface ContainerText {
  raw: string;
  /** Normalized text of the container. */
  text: string;
  toRaw: (normIndex: number) => number;
  toNorm: (rawIndex: number) => number;
  /** DOM position of a raw offset. */
  point: (rawIndex: number) => { node: Text; offset: number } | null;
  /** Raw offset of a DOM position inside the container. */
  offsetOf: (node: Node, offset: number) => number;
  /** Text nodes carrying content between two raw offsets. */
  nodesIn: (rawStart: number, rawEnd: number) => Text[];
}

function collect(el: Element, overlayTag: string | undefined, pieces: Piece[], chunks: string[]): void {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      const value = node.nodeValue ?? '';
      const previous = pieces[pieces.length - 1];
      const start = previous ? previous.end : 0;
      pieces.push({ node: node as Text, start, end: start + value.length });
      chunks.push(value);
    } else if (node.nodeType === 1) {
      const child = node as Element;
      if (SKIP_TEXT.has(child.tagName) || isOverlay(child, overlayTag)) continue;
      collect(child, overlayTag, pieces, chunks);
    }
  }
}

/** The container's text, normalized, with offsets mapped back to its text nodes. */
export function indexText(el: Element, overlayTag?: string): ContainerText {
  const pieces: Piece[] = [];
  const chunks: string[] = [];
  collect(el, overlayTag, pieces, chunks);
  const raw = chunks.join('');
  const { text, indices } = normalizeWithIndices(raw);

  const toNorm = (rawIndex: number): number => {
    let lo = 0;
    let hi = indices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((indices[mid] as number) < rawIndex) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const point = (rawIndex: number): { node: Text; offset: number } | null => {
    for (const piece of pieces) {
      if (rawIndex >= piece.start && rawIndex < piece.end)
        return { node: piece.node, offset: rawIndex - piece.start };
    }
    const last = pieces[pieces.length - 1];
    return last ? { node: last.node, offset: last.end - last.start } : null;
  };

  const first = (node: Node): Piece | undefined =>
    pieces.find((p) => p.node === node || node.contains(p.node));
  const last = (node: Node): Piece | undefined =>
    [...pieces].reverse().find((p) => p.node === node || node.contains(p.node));

  const offsetOf = (node: Node, offset: number): number => {
    if (node.nodeType === 3) {
      const piece = pieces.find((p) => p.node === node);
      return piece ? piece.start + Math.min(offset, piece.end - piece.start) : 0;
    }
    const children = Array.from(node.childNodes);
    for (let i = offset; i < children.length; i += 1) {
      const hit = first(children[i] as Node);
      if (hit) return hit.start;
    }
    for (let i = offset - 1; i >= 0; i -= 1) {
      const hit = last(children[i] as Node);
      if (hit) return hit.end;
    }
    return 0;
  };

  const nodesIn = (rawStart: number, rawEnd: number): Text[] =>
    pieces
      .filter((p) => p.end > rawStart && p.start < rawEnd && p.node.data.trim() !== '')
      .map((p) => p.node);

  return { raw, text, toRaw: (n) => indices[n] ?? raw.length, toNorm, point, offsetOf, nodesIn };
}

/** Nearest block-level ancestor that is not `body`. */
export function blockContainer(node: Node): Element | null {
  const view = node.ownerDocument?.defaultView ?? null;
  let current: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') return null;
    const display = view ? view.getComputedStyle(current).getPropertyValue('display') : '';
    if (BLOCK_TAGS.has(tag) || BLOCK_DISPLAY.has(display)) return current;
    current = current.parentElement;
  }
  return null;
}

export type DescribeRangeResult =
  | { ok: true; target: TextTarget }
  | { ok: false; reason: 'empty' | 'no-container' };

function buildRange(
  doc: Document,
  index: ContainerText,
  start: number,
  end: number,
): Range | null {
  if (end <= start) return null;
  const head = index.point(index.toRaw(start));
  const tailRaw = index.toRaw(end - 1);
  const tail = index.point(tailRaw);
  if (!head || !tail) return null;
  const range = doc.createRange();
  range.setStart(head.node, head.offset);
  range.setEnd(tail.node, tail.offset + 1);
  return range;
}

/** Document-coordinate rects for a range, merged per line. */
export function rangeRects(range: Range): Rect[] {
  const doc = range.startContainer.ownerDocument ?? (range.startContainer as Document);
  return mergeLineRects(clientRectsOf(range, doc));
}

/** Blocks holding text between two normalized offsets, document order. */
function spannedBlocks(index: ContainerText, start: number, end: number): Element[] {
  const out: Element[] = [];
  for (const node of index.nodesIn(index.toRaw(start), index.toRaw(end - 1) + 1)) {
    const block = blockContainer(node);
    if (block && !out.includes(block)) out.push(block);
  }
  return out;
}

/** A `TextTarget` for a selection, or why it cannot be anchored. */
export function describeRange(range: Range, opts: DescribeOptions = {}): DescribeRangeResult {
  if (range.collapsed || range.toString().trim() === '') return { ok: false, reason: 'empty' };

  const container = blockContainer(range.commonAncestorContainer);
  if (!container) return { ok: false, reason: 'no-container' };

  const index = indexText(container, opts.overlayTag);
  let start = index.toNorm(index.offsetOf(range.startContainer, range.startOffset));
  let end = index.toNorm(index.offsetOf(range.endContainer, range.endOffset));
  while (start < end && index.text[start] === ' ') start += 1;
  while (end > start && index.text[end - 1] === ' ') end -= 1;
  const quote = index.text.slice(start, end);
  if (quote === '') return { ok: false, reason: 'empty' };

  const blocks = spannedBlocks(index, start, end);
  const target: TextTarget = {
    kind: 'text',
    container: describeElement(container, opts),
    quote,
    prefix: index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: index.text.slice(end, end + CONTEXT_CHARS),
    start,
    end,
    rects: rangeRects(range),
  };
  if (blocks.length > 1) target.blocks = compactRefs(blocks, opts);
  return { ok: true, target };
}

function closestIndex(haystack: string, needle: string, near: number): number {
  let best = -1;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (best === -1 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  }
  return best;
}

interface Match {
  start: number;
  end: number;
}

function search(text: string, target: TextTarget): Match | null {
  const { quote, prefix, suffix, start } = target;

  if (text.slice(start, target.end) === quote) return { start, end: target.end };

  if (prefix !== '' || suffix !== '') {
    const withContext = closestIndex(text, prefix + quote + suffix, start);
    if (withContext !== -1)
      return { start: withContext + prefix.length, end: withContext + prefix.length + quote.length };
  }

  const plain = closestIndex(text, quote, start);
  if (plain !== -1) return { start: plain, end: plain + quote.length };

  if (quote.length >= FUZZY_MIN) {
    const head = quote.slice(0, FUZZY_HEAD);
    const found = closestIndex(text, head, start);
    if (found !== -1) return { start: found, end: Math.min(text.length, found + quote.length) };
  }

  return null;
}

function findContainer(doc: Document, target: TextTarget): Element | null {
  for (const selector of [target.container.selector, ...target.container.fallbacks]) {
    const found = resolveSelector(doc, selector);
    if (found) return found;
  }
  return null;
}

export interface Anchor {
  range: Range;
  state: 'exact' | 'moved';
}

/** Re-anchor a stored text target in the live document. */
export function anchorText(doc: Document, target: TextTarget, overlayTag?: string): Anchor | null {
  const container = findContainer(doc, target);
  const siblings = Array.from(doc.querySelectorAll(target.container.tag)).filter((el) => el !== container);
  const candidates = container ? [container, ...siblings] : siblings;

  for (const el of candidates) {
    const index = indexText(el, overlayTag);
    const match = search(index.text, target);
    if (!match) continue;
    const range = buildRange(doc, index, match.start, match.end);
    if (!range) continue;
    const exact =
      el === container &&
      match.start === target.start &&
      index.text.slice(match.start, match.end) === target.quote;
    return { range, state: exact ? 'exact' : 'moved' };
  }

  return null;
}
