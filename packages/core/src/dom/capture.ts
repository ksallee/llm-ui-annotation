import type { Rect, Stroke } from '../model/types.js';
import { isOverlay } from './describe.js';
import { area, inflate, intersect, rectOf, scrollOffset } from './rect.js';
import { renderStrokes, type StrokeContext } from './strokes.js';

const DEFAULT_PADDING = 8;
const DEFAULT_MAX_SIDE = 1600;
const DEFAULT_TIMEOUT = 5000;
const COVERAGE = 0.9;

export interface CaptureOptions {
  /** `domToCanvas` from modern-screenshot, injected so core stays dependency-free. */
  domToCanvas: (node: Element, options: { scale: number; timeout: number }) => Promise<HTMLCanvasElement>;
  padding?: number;
  maxSide?: number;
  timeout?: number;
  overlayTag?: string;
}

/** Smallest element covering at least 90% of the region. */
export function pickCaptureTarget(doc: Document, region: Rect, overlayTag?: string): Element | null {
  const needed = COVERAGE * area(region);
  const offset = scrollOffset(doc);
  const centre: [number, number] = [
    region.x + region.width / 2 - offset.x,
    region.y + region.height / 2 - offset.y,
  ];
  const stack =
    typeof doc.elementsFromPoint === 'function'
      ? doc.elementsFromPoint(centre[0], centre[1])
      : Array.from(doc.body?.querySelectorAll('*') ?? []);

  let best: { el: Element; size: number } | null = null;
  for (const el of stack) {
    if (isOverlay(el, overlayTag)) continue;
    const rect = rectOf(el);
    if (area(intersect(rect, region)) < needed) continue;
    const size = area(rect);
    if (!best || size < best.size) best = { el, size };
  }
  return best?.el ?? doc.body ?? null;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Screenshot of a region with the strokes burned in. `null` on any failure. */
export async function captureRegion(
  doc: Document,
  region: Rect,
  strokes: Stroke[],
  opts: CaptureOptions,
): Promise<Blob | null> {
  const overlayTag = opts.overlayTag ?? 'annot-overlay';
  const host = doc.querySelector<HTMLElement>(overlayTag);
  const hidden = host?.style.visibility ?? null;
  if (host) host.style.visibility = 'hidden';

  try {
    const padded = inflate(region, opts.padding ?? DEFAULT_PADDING);
    const target = pickCaptureTarget(doc, padded, overlayTag);
    if (!target) return null;

    const dpr = doc.defaultView?.devicePixelRatio ?? 1;
    const scale = Math.min(2, dpr);
    const source = await opts.domToCanvas(target, {
      scale,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT,
    });

    const targetRect = rectOf(target);
    const crop = intersect(padded, targetRect);
    if (crop.width <= 0 || crop.height <= 0) return null;

    const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE;
    const shrink = Math.min(1, maxSide / Math.max(crop.width, crop.height));
    const out = doc.createElement('canvas');
    out.width = Math.max(1, Math.round(crop.width * shrink));
    out.height = Math.max(1, Math.round(crop.height * shrink));

    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      source,
      (crop.x - targetRect.x) * scale,
      (crop.y - targetRect.y) * scale,
      crop.width * scale,
      crop.height * scale,
      0,
      0,
      out.width,
      out.height,
    );
    renderStrokes(ctx as StrokeContext, strokes, { x: crop.x, y: crop.y }, shrink);
    return await toBlob(out);
  } catch {
    return null;
  } finally {
    if (host) host.style.visibility = hidden ?? '';
  }
}
