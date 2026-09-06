import type { Rect } from '../model/types.js';
import { rectOf } from './rect.js';
import { isOverlay } from './describe.js';

const BLOCKS = new Set([
  'main', 'article', 'section', 'aside', 'nav', 'header', 'footer', 'div', 'ul', 'ol', 'dl',
  'form', 'fieldset', 'table', 'figure', 'blockquote', 'p', 'li',
]);

export interface ContentFrameOptions {
  padding?: number;
  minWidth?: number;
  overlayTag?: string;
}

/**
 * The capture area a new drawing should default to: as wide as the content column the marks sit in,
 * as tall as the marks. A tight crop round an arrow shows the agent almost nothing of the UI.
 */
export function contentFrame(doc: Document, marks: Rect, opts: ContentFrameOptions = {}): Rect {
  const pad = opts.padding ?? 24;
  const minWidth = opts.minWidth ?? 240;
  const column = columnFor(doc, marks, minWidth, opts.overlayTag);
  const x = column ? column.x : marks.x;
  const width = column ? column.width : marks.width;
  return {
    x: Math.max(0, Math.round(x - pad)),
    y: Math.max(0, Math.round(marks.y - pad)),
    width: Math.round(width + pad * 2),
    height: Math.round(marks.height + pad * 2),
  };
}

/** The narrowest block ancestor whose box spans the marks horizontally. */
function columnFor(
  doc: Document,
  marks: Rect,
  minWidth: number,
  overlayTag?: string,
): Rect | null {
  let best: Rect | null = null;
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (isOverlay(el, overlayTag)) continue;
    if (!BLOCKS.has(el.tagName.toLowerCase())) continue;
    const r = rectOf(el);
    if (r.width < minWidth || r.width < marks.width) continue;
    if (r.x > marks.x || r.x + r.width < marks.x + marks.width) continue;
    if (r.y > marks.y || r.y + r.height < marks.y + marks.height) continue;
    if (!best || r.width < best.width) best = r;
  }
  return best;
}
