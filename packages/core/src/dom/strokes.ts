import type { Rect, Stroke } from '../model/types.js';
import { inflate, union } from './rect.js';

const CHAR_WIDTH = 0.6;
const LINE_HEIGHT = 1.4;
const PILL_PADDING = 4;
const ARROW_HEAD = 3;

export interface Point {
  x: number;
  y: number;
}

export type StrokeContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'quadraticCurveTo'
  | 'ellipse'
  | 'rect'
  | 'stroke'
  | 'fill'
  | 'fillText'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'font'
  | 'textBaseline'
>;

/** Every stroke shifted by `dx`/`dy`, as new objects. */
export function translateStrokes(strokes: Stroke[], dx: number, dy: number): Stroke[] {
  if (dx === 0 && dy === 0) return strokes;
  const shift = (r: Rect): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });
  return strokes.map((stroke): Stroke => {
    switch (stroke.tool) {
      case 'brush':
        return { ...stroke, points: stroke.points.map(([x, y]) => [x + dx, y + dy]) };
      case 'arrow':
        return {
          ...stroke,
          from: [stroke.from[0] + dx, stroke.from[1] + dy],
          to: [stroke.to[0] + dx, stroke.to[1] + dy],
        };
      case 'label':
        return { ...stroke, at: [stroke.at[0] + dx, stroke.at[1] + dy] };
      default:
        return { ...stroke, rect: shift(stroke.rect) };
    }
  });
}

/** Pill size for a label, without measuring text. */
export function labelBox(text: string, size: number): { width: number; height: number } {
  return {
    width: text.length * size * CHAR_WIDTH + PILL_PADDING * 2,
    height: size * LINE_HEIGHT + PILL_PADDING * 2,
  };
}

function boundsOf(stroke: Stroke): Rect | null {
  switch (stroke.tool) {
    case 'brush': {
      const first = stroke.points[0];
      if (!first) return null;
      let box: Rect = { x: first[0], y: first[1], width: 0, height: 0 };
      for (const [x, y] of stroke.points) box = union(box, { x, y, width: 0, height: 0 });
      return inflate(box, stroke.width / 2);
    }
    case 'arrow': {
      const box = union(
        { x: stroke.from[0], y: stroke.from[1], width: 0, height: 0 },
        { x: stroke.to[0], y: stroke.to[1], width: 0, height: 0 },
      );
      return inflate(box, stroke.width * ARROW_HEAD * 0.5);
    }
    case 'rect':
    case 'ellipse':
      return inflate(stroke.rect, stroke.width / 2);
    case 'label': {
      const { width, height } = labelBox(stroke.text, stroke.size);
      return { x: stroke.at[0], y: stroke.at[1], width, height };
    }
  }
}

/** Bounding box of every stroke, padded. */
export function strokeBounds(strokes: Stroke[], padding = 24): Rect {
  let box: Rect | null = null;
  for (const stroke of strokes) {
    const next = boundsOf(stroke);
    if (!next) continue;
    box = box ? union(box, next) : next;
  }
  return box ? inflate(box, padding) : { x: 0, y: 0, width: 0, height: 0 };
}

/** Readable ink over a filled pill. */
function inkFor(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return '#ffffff';
  const value = parseInt(hex, 16);
  const luminance = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 255000;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}

function roundedRect(ctx: StrokeContext, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Draw strokes onto a canvas whose top-left is `origin` in document coordinates. */
export function renderStrokes(
  ctx: StrokeContext,
  strokes: Stroke[],
  origin: Point,
  scale = 1,
): void {
  const px = (x: number): number => (x - origin.x) * scale;
  const py = (y: number): number => (y - origin.y) * scale;

  for (const stroke of strokes) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;

    if (stroke.tool === 'brush') {
      ctx.lineWidth = stroke.width * scale;
      const points = stroke.points;
      const first = points[0];
      if (first) {
        ctx.beginPath();
        ctx.moveTo(px(first[0]), py(first[1]));
        for (let i = 1; i < points.length - 1; i += 1) {
          const current = points[i] as [number, number];
          const next = points[i + 1] as [number, number];
          ctx.quadraticCurveTo(
            px(current[0]),
            py(current[1]),
            px((current[0] + next[0]) / 2),
            py((current[1] + next[1]) / 2),
          );
        }
        const last = points[points.length - 1] as [number, number];
        if (points.length > 1) ctx.lineTo(px(last[0]), py(last[1]));
        ctx.stroke();
      }
    } else if (stroke.tool === 'arrow') {
      ctx.lineWidth = stroke.width * scale;
      const x1 = px(stroke.from[0]);
      const y1 = py(stroke.from[1]);
      const x2 = px(stroke.to[0]);
      const y2 = py(stroke.to[1]);
      const head = stroke.width * ARROW_HEAD * scale;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(angle - 0.4) * head, y2 - Math.sin(angle - 0.4) * head);
      ctx.lineTo(x2 - Math.cos(angle + 0.4) * head, y2 - Math.sin(angle + 0.4) * head);
      ctx.closePath();
      ctx.fill();
    } else if (stroke.tool === 'rect') {
      ctx.lineWidth = stroke.width * scale;
      ctx.beginPath();
      ctx.rect(px(stroke.rect.x), py(stroke.rect.y), stroke.rect.width * scale, stroke.rect.height * scale);
      ctx.stroke();
    } else if (stroke.tool === 'ellipse') {
      ctx.lineWidth = stroke.width * scale;
      ctx.beginPath();
      ctx.ellipse(
        px(stroke.rect.x + stroke.rect.width / 2),
        py(stroke.rect.y + stroke.rect.height / 2),
        (stroke.rect.width / 2) * scale,
        (stroke.rect.height / 2) * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      const { width, height } = labelBox(stroke.text, stroke.size);
      const x = px(stroke.at[0]);
      const y = py(stroke.at[1]);
      roundedRect(ctx, x, y, width * scale, height * scale, PILL_PADDING * scale);
      ctx.fill();
      ctx.fillStyle = inkFor(stroke.color);
      ctx.font = `${stroke.size * scale}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(stroke.text, x + PILL_PADDING * scale, y + PILL_PADDING * scale);
    }

    ctx.restore();
  }
}
