import type { Rect } from '../model/types.js';

const LINE_TOLERANCE = 2;

export function scrollOffset(doc: Document): { x: number; y: number } {
  const view = doc.defaultView;
  return {
    x: view?.scrollX ?? doc.documentElement?.scrollLeft ?? 0,
    y: view?.scrollY ?? doc.documentElement?.scrollTop ?? 0,
  };
}

function round(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function toDocument(box: DOMRectReadOnly, offset: { x: number; y: number }): Rect {
  return round({ x: box.left + offset.x, y: box.top + offset.y, width: box.width, height: box.height });
}

/** Bounding box in document coordinates, rounded to integers. */
export function rectOf(el: Element): Rect {
  const doc = el.ownerDocument;
  return toDocument(el.getBoundingClientRect(), scrollOffset(doc));
}

/** Client rects of a range in document coordinates. */
export function clientRectsOf(range: Range, doc: Document): Rect[] {
  const offset = scrollOffset(doc);
  return Array.from(range.getClientRects())
    .map((box) => toDocument(box, offset))
    .filter((r) => r.width > 0 || r.height > 0);
}

export function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function inflate(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/** Union rects that sit on the same line and are at most 2 px apart. */
export function mergeLineRects(rects: Rect[], gap = LINE_TOLERANCE): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const rect of sorted) {
    const last = out[out.length - 1];
    const sameLine =
      last !== undefined &&
      Math.abs(last.y - rect.y) <= LINE_TOLERANCE &&
      Math.abs(last.height - rect.height) <= LINE_TOLERANCE;
    if (last && sameLine && rect.x - (last.x + last.width) <= gap) out[out.length - 1] = union(last, rect);
    else out.push(rect);
  }
  return out;
}
