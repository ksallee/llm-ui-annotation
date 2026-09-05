import type { Rect } from '@llm-ui-annotation/core';
import { describeElement, docRect, isOverlay } from '../dom/core-dom.js';
import { coverage, rectFromPoints, unionRects } from '../dom/geometry.js';
import type { AnnotState } from '../state/annot-state.svelte.js';

const IGNORED = new Set(['HTML', 'BODY']);

/** Topmost host element under a viewport point, skipping the overlay. */
export function elementUnder(state: AnnotState, x: number, y: number): Element | null {
  const found = state.doc.elementsFromPoint(x, y);
  for (const el of found) {
    if (isOverlay(el) || IGNORED.has(el.tagName)) continue;
    return el;
  }
  return null;
}

export function elementMode(state: AnnotState, layer: HTMLElement): () => void {
  let start: { x: number; y: number } | null = null;

  const point = (event: PointerEvent): { x: number; y: number } => ({
    x: event.clientX + state.scroll.x,
    y: event.clientY + state.scroll.y,
  });

  const onMove = (event: PointerEvent): void => {
    if (start) {
      state.marquee = rectFromPoints(start, point(event));
      return;
    }
    const el = elementUnder(state, event.clientX, event.clientY);
    state.hover = el
      ? { el, rect: docRect(el), label: describeElement(el, { styles: false, context: false }).name }
      : { el: null, rect: null, label: '' };
  };

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    start = point(event);
    layer.setPointerCapture?.(event.pointerId);
  };

  const onUp = (event: PointerEvent): void => {
    if (!start) return;
    const end = point(event);
    const box = rectFromPoints(start, end);
    const dragged = box.width > 6 || box.height > 6;
    start = null;
    state.marquee = null;

    if (dragged) {
      const picked = [...(state.doc.body?.querySelectorAll('*') ?? [])].filter((el) => {
        if (isOverlay(el) || IGNORED.has(el.tagName)) return false;
        const rect = docRect(el);
        return rect.width > 4 && rect.height > 4 && coverage(rect, box) >= 0.5;
      });
      const outermost = picked.filter((el) => !picked.some((other) => other !== el && other.contains(el)));
      state.selection = outermost;
      if (outermost.length > 0) open(state, outermost);
      return;
    }

    const el = elementUnder(state, event.clientX, event.clientY);
    if (!el) return;
    if (event.shiftKey) {
      state.selection = state.selection.includes(el)
        ? state.selection.filter((other) => other !== el)
        : [...state.selection, el];
      return;
    }
    state.selection = [el];
    open(state, [el]);
  };

  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointerup', onUp);
  return () => {
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerdown', onDown);
    layer.removeEventListener('pointerup', onUp);
    state.hover = { el: null, rect: null, label: '' };
    state.marquee = null;
  };
}

function open(state: AnnotState, elements: Element[]): void {
  const refs = elements.map((el) => describeElement(el, { styles: state.detail !== 'compact' }));
  const anchor: Rect = unionRects(refs.map((ref) => ref.rect)) ?? refs[0]!.rect;
  state.openPopup('element', { kind: 'element', elements: refs }, anchor);
}
