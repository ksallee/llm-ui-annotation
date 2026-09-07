import type { Rect, Stroke } from '@llm-ui-annotation/core';
import { findElementsInRect } from '../dom/core-dom.js';
import { docPoint, rectFromPoints, sample } from '../dom/geometry.js';
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

/** Index of the topmost stroke under the point, or -1. */
function strokeAt(strokes: Stroke[], x: number, y: number): number {
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    if (near(strokes[i] as Stroke, x, y)) return i;
  }
  return -1;
}

/** Pointer capture is best-effort: a synthetic pointer has none to take. */
function capture(layer: HTMLElement, id: number): void {
  try {
    layer.setPointerCapture?.(id);
  } catch {
    // the layer covers the viewport anyway
  }
}

const inside = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

export function pageMode(state: AnnotState, layer: HTMLElement): () => void {
  let drawing: { id: string; index: number } | null = null;
  let origin: { x: number; y: number } | null = null;
  let dragging: { from: Rect; at: { x: number; y: number }; ids: string[]; strokes: boolean } | null = null;

  /** Move: a click picks a drawing or, inside one, a stroke; the drag carries what is picked. */
  const onSelect = (event: PointerEvent, at: { x: number; y: number }): void => {
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;

    if (state.insideDrawing) {
      const ref = state.drawingRef(state.insideDrawing);
      const index = ref ? strokeAt(ref.strokes, at.x, at.y) : -1;
      if (index >= 0) {
        if (!state.selectedStrokes.has(index)) state.pickStroke(index, additive);
        const box = state.pickedStrokeBox;
        if (box) dragging = { from: box, at, ids: [state.insideDrawing], strokes: true };
        return;
      }
      if (ref && inside(ref.region, at.x, at.y)) {
        state.selectedStrokes.clear();
        return;
      }
      state.insideDrawing = null;
      state.selectedStrokes.clear();
    }

    const hit = state.drawingAt(at.x, at.y);
    if (!hit) {
      state.clearDrawSelection();
      return;
    }
    if (!state.selectedDrawings.has(hit.id)) state.pickDrawing(hit.id, additive);
    const ids = [...state.selectedDrawings];
    dragging = { from: hit.region, at, ids: ids.length > 0 ? ids : [hit.id], strokes: false };
  };

  /** Frame: the box alone, so the capture can be widened around marks that stay put. */
  const onFrame = (at: { x: number; y: number }): void => {
    const hit = state.drawingAt(at.x, at.y);
    if (!hit) {
      state.clearDrawSelection();
      return;
    }
    state.pickDrawing(hit.id);
    dragging = { from: hit.region, at, ids: [hit.id], strokes: false };
  };

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const at = docPoint(event, state.scroll);
    const color = state.drawColor || state.palette[0] || 'currentColor';

    if (state.drawTool === 'move' || state.drawTool === 'frame') {
      capture(layer, event.pointerId);
      if (state.drawTool === 'move') onSelect(event, at);
      else onFrame(at);
      return;
    }

    const into = state.drawingForPoint(at.x, at.y);

    if (state.drawTool === 'eraser') {
      const index = strokeAt(state.strokesOf(into), at.x, at.y);
      if (index >= 0) {
        const committed = state.drawingRef(into)?.committed;
        state.eraseStrokeOf(into, index);
        if (committed) void state.saveDrawing(into);
      }
      return;
    }
    if (state.drawTool === 'label') {
      // Without this the browser's own focus move on mousedown blurs the editor we are about to
      // mount, and the blur handler throws the label away before anyone can type in it.
      event.preventDefault();
      state.labelDraft = { at: [at.x, at.y], text: '' };
      return;
    }

    capture(layer, event.pointerId);
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
    state.addStroke(into, started);
    drawing = { id: into, index: state.strokesOf(into).length - 1 };
  };

  const onMove = (event: PointerEvent): void => {
    const at = docPoint(event, state.scroll);

    if (dragging) {
      const dx = at.x - dragging.at.x;
      const dy = at.y - dragging.at.y;
      const to = { ...dragging.from, x: dragging.from.x + dx, y: dragging.from.y + dy };
      if (dragging.strokes) state.transformPickedStrokes(dragging.from, to);
      else if (state.drawTool === 'frame') state.setDrawingRegion(dragging.ids[0] as string, to);
      else for (const id of dragging.ids) state.moveDrawing(id, dx, dy);
      dragging = { ...dragging, from: to, at };
      return;
    }

    if (!drawing || !origin) return;
    const last = state.strokesOf(drawing.id)[drawing.index];
    if (!last) return;
    if (last.tool === 'brush') {
      if (!sample(last.points, [at.x, at.y])) return;
      state.replaceStroke(drawing.id, drawing.index, { ...last, points: [...last.points, [at.x, at.y]] });
    } else if (last.tool === 'arrow') {
      state.replaceStroke(drawing.id, drawing.index, { ...last, to: [at.x, at.y] });
    } else if (last.tool === 'rect' || last.tool === 'ellipse') {
      state.replaceStroke(drawing.id, drawing.index, { ...last, rect: rectFromPoints(origin, at) });
    }
  };

  const onUp = (): void => {
    const touched = new Set<string>([...(dragging?.ids ?? []), ...(drawing ? [drawing.id] : [])]);
    for (const id of touched) if (state.drawingRef(id)?.committed) void state.saveDrawing(id);
    drawing = null;
    origin = null;
    dragging = null;
  };

  /**
   * Double-click steps inside a drawing, or opens the caption under the cursor — from any tool,
   * because it is a navigation gesture and having to reach for Move first is friction. The one
   * exception is the drawing you are currently adding to: a fast double-tap there is sketching.
   */
  const onDouble = (event: MouseEvent): void => {
    const at = docPoint(event, state.scroll);
    const hit = state.insideDrawing ?? state.drawingAt(at.x, at.y)?.id ?? null;
    // Only the brush makes a double-tap mean sketching; with every other tool a double-click
    // produces nothing useful, so it is free to mean "go inside".
    const sketching = state.drawTool === 'brush' && hit === state.activeDrawingId;
    const id = sketching && state.insideDrawing !== hit ? null : hit;
    if (!id) return;
    const strokes = state.strokesOf(id);
    const index = strokeAt(strokes, at.x, at.y);
    const stroke = index >= 0 ? strokes[index] : null;
    if (state.insideDrawing === id && stroke && stroke.tool === 'label') {
      state.labelDraft = { at: stroke.at, text: stroke.text, edit: { drawing: id, index } };
      return;
    }
    state.enterDrawing(id);
    if (index >= 0) state.pickStroke(index);
  };

  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  layer.addEventListener('dblclick', onDouble);
  return () => {
    layer.removeEventListener('pointerdown', onDown);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    layer.removeEventListener('pointercancel', onUp);
    layer.removeEventListener('dblclick', onDouble);
  };
}

/** Commit the inline caption editor as a stroke. */
export function commitLabel(state: AnnotState): void {
  const draft = state.labelDraft;
  if (!draft) return;
  const text = draft.text.trim();
  const edit = draft.edit;
  state.labelDraft = null;

  if (edit) {
    const stroke = state.strokesOf(edit.drawing)[edit.index];
    if (!stroke || stroke.tool !== 'label') return;
    const committed = state.drawingRef(edit.drawing)?.committed;
    if (text) state.replaceStroke(edit.drawing, edit.index, { ...stroke, text });
    else state.eraseStrokeOf(edit.drawing, edit.index);
    if (committed) void state.saveDrawing(edit.drawing);
    return;
  }

  if (!text) return;
  const into = state.drawingForPoint(draft.at[0], draft.at[1]);
  state.addStroke(into, {
    tool: 'label',
    at: draft.at,
    text,
    color: state.drawColor || state.palette[0] || 'currentColor',
    size: 16,
  });
  if (state.drawingRef(into)?.committed) void state.saveDrawing(into);
}

/** Open the popup for the active pending drawing. */
export function openPagePopup(state: AnnotState): void {
  const strokes = state.drawing.strokes;
  if (strokes.length === 0) return;
  const region = state.drawingRegion ?? state.defaultRegion(strokes);
  const elements = findElementsInRect(state.doc, region, { styles: false });
  state.openPopup('page', { kind: 'page', region, strokes, screenshot: null, elements }, region);
}
