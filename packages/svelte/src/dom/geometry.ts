import type { Rect } from '@llm-ui-annotation/core';
import type { Corner } from '../options.js';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const toViewport = (rect: Rect, scroll: Point): Rect => ({
  x: rect.x - scroll.x,
  y: rect.y - scroll.y,
  width: rect.width,
  height: rect.height,
});

export const unionRects = (rects: Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
};

export const rectFromPoints = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Fraction of `a` that lies inside `b`. */
export function coverage(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const own = a.width * a.height;
  return own > 0 ? (w * h) / own : 0;
}

export interface PlaceOptions {
  gap?: number;
  margin?: number;
}

/**
 * Viewport position for a floating card anchored under a rect, flipped and clamped to stay in view.
 *
 * @param anchor target rect in viewport coordinates.
 * @param size card size.
 * @param viewport viewport size.
 */
export function place(anchor: Rect, size: Size, viewport: Size, options: PlaceOptions = {}): Point {
  const gap = options.gap ?? 8;
  const margin = options.margin ?? 8;
  const below = anchor.y + anchor.height + gap;
  const above = anchor.y - size.height - gap;
  const fitsBelow = below + size.height <= viewport.height - margin;
  const y = fitsBelow ? below : Math.max(margin, above >= margin ? above : below);
  const x = Math.min(
    Math.max(margin, anchor.x),
    Math.max(margin, viewport.width - size.width - margin),
  );
  return { x, y: Math.min(y, Math.max(margin, viewport.height - size.height - margin)) };
}

/** Nearest corner for a point, used when the pill is dropped. */
export function nearestCorner(point: Point, viewport: Size): Corner {
  const right = point.x > viewport.width / 2;
  const bottom = point.y > viewport.height / 2;
  return `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as Corner;
}

/** Fixed-position declarations pinning a floating element to a corner, clear of an open drawer. */
export function cornerStyle(corner: Corner, margin = 20, drawer = 0): string {
  const vertical = corner.startsWith('b') ? `bottom: ${margin}px; top: auto;` : `top: ${margin}px; bottom: auto;`;
  const horizontal = corner.endsWith('r')
    ? `right: ${margin + drawer}px; left: auto;`
    : `left: ${margin}px; right: auto;`;
  return `${vertical} ${horizontal}`;
}

/** Points sampled at least `min` px apart, for brush strokes. */
export function sample(points: [number, number][], next: [number, number], min = 2): boolean {
  const last = points.at(-1);
  if (!last) return true;
  return Math.hypot(next[0] - last[0], next[1] - last[1]) >= min;
}

/** SVG path for a brush stroke, smoothed with quadratic midpoints. */
export function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (rest.length === 0) return `M ${first![0]} ${first![1]} l 0.1 0`;
  let d = `M ${first![0]} ${first![1]}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const [x1, y1] = rest[i]!;
    const [x2, y2] = rest[i + 1]!;
    d += ` Q ${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const last = rest.at(-1)!;
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

/** `3m`, `2h`, `now`. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, (now - then) / 1000);
  if (seconds < 45) return 'now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}
