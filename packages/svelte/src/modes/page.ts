import type { Stroke } from '@llm-ui-annotation/core';
import { findElementsInRect, strokeBounds } from '../dom/core-dom.js';
import { rectFromPoints, sample } from '../dom/geometry.js';
import type { AnnotState } from '../state/annot-state.svelte.js';

const near = (stroke: Stroke, x: number, y: number, slack = 8): boolean => {
  if (stroke.tool === 'brush') {
    return stroke.points.some(([px, py]) => Math.hypot(px - x, py - y) <= slack + stroke.width);
  }
  if (stroke.tool === 'arrow') {
    const [x1, y1] = stroke.from;
    const [x2, y2] = stroke.to;
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const distance = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / length;
    return distance <= slack + stroke.width;
  }
  if (stroke.tool === 'label') {
    return Math.abs(stroke.at[0] - x) <= stroke.text.length * stroke.size * 0.6 && Math.abs(stroke.at[1] - y) <= stroke.size;
  }
  const r = stroke.rect;
  return x >= r.x - slack && x <= r.x + r.width + slack && y >= r.y - slack && y <= r.y + r.height + slack;
};

export function pageMode(state: AnnotState, layer: HTMLElement): () => void {
  let drawing: Stroke | null = null;
  let origin: { x: number; y: number } | null = null;

  const point = (event: PointerEvent): { x: number; y: number } => ({
    x: event.clientX + state.scroll.x,
    y: event.clientY + state.scroll.y,
  });

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const at = point(event);
    const color = state.drawColor || state.palette[0] || 'currentColor';

    if (state.drawTool === 'eraser') {
      const index = state.drawing.strokes.findIndex((stroke) => near(stroke, at.x, at.y));
      if (index >= 0) state.eraseStrokeAt(index);
      return;
    }
    if (state.drawTool === 'label') {
      // Without this the browser's own focus move on mousedown blurs the editor we are about to
      // mount, and the blur handler throws the label away before anyone can type in it.
      event.preventDefault();
      state.labelDraft = { at: [at.x, at.y], text: '' };
      return;
    }

    layer.setPointerCapture?.(event.pointerId);
    origin = at;
    const started: Stroke =
      state.drawTool === 'brush'
        ? { tool: 'brush', points: [[at.x, at.y]], color, width: state.drawWidth }
        : state.drawTool === 'arrow'
          ? { tool: 'arrow', from: [at.x, at.y], to: [at.x, at.y], color, width: state.drawWidth }
          : {
              tool: state.drawTool === 'ellipse' ? 'ellipse' : 'rect',
              rect: { x: at.x, y: at.y, width: 0, height: 0 },
              color,
              width: state.drawWidth,
            };
    drawing = started;
    state.pushStroke(started);
  };

  const onMove = (event: PointerEvent): void => {
    if (!drawing || !origin) return;
    const at = point(event);
    const strokes = [...state.drawing.strokes];
    const last = strokes.at(-1);
    if (!last) return;
    if (last.tool === 'brush') {
      if (!sample(last.points, [at.x, at.y])) return;
      strokes[strokes.length - 1] = { ...last, points: [...last.points, [at.x, at.y]] };
    } else if (last.tool === 'arrow') {
      strokes[strokes.length - 1] = { ...last, to: [at.x, at.y] };
    } else if (last.tool === 'rect' || last.tool === 'ellipse') {
      strokes[strokes.length - 1] = { ...last, rect: rectFromPoints(origin, at) };
    }
    state.drawing = { strokes, undone: [] };
  };

  const onUp = (): void => {
    drawing = null;
    origin = null;
  };

  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  return () => {
    layer.removeEventListener('pointerdown', onDown);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    layer.removeEventListener('pointercancel', onUp);
  };
}

/** Commit the inline label editor as a stroke. */
export function commitLabel(state: AnnotState): void {
  const draft = state.labelDraft;
  if (!draft) return;
  const text = draft.text.trim();
  if (text) {
    state.pushStroke({
      tool: 'label',
      at: draft.at,
      text,
      color: state.drawColor || state.palette[0] || 'currentColor',
      size: 16,
    });
  }
  state.labelDraft = null;
}

/** Open the popup for the pending drawing. */
export function openPagePopup(state: AnnotState): void {
  const strokes = state.drawing.strokes;
  if (strokes.length === 0) return;
  const region = state.drawingRegion ?? strokeBounds(strokes);
  const elements = findElementsInRect(state.doc, region, { styles: false });
  state.openPopup('page', { kind: 'page', region, strokes, screenshot: null, elements }, region);
}
