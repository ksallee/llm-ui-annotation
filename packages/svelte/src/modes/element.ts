import type { Rect } from '@llm-ui-annotation/core';
import { describeElement, docRect, elementLabelOf, isOverlay } from '../dom/core-dom.js';
import { coverage, docPoint, rectFromPoints, unionRects } from '../dom/geometry.js';
import type { AnnotState } from '../state/annot-state.svelte.js';

const IGNORED = new Set(['HTML', 'BODY']);

const MAX_SHADOW_DEPTH = 8;

/** `elementsFromPoint` stops at a shadow host, so walk down into open roots by hand. */
function pierce(el: Element, x: number, y: number, depth = 0): Element {
  const root = el.shadowRoot;
  if (!root || depth >= MAX_SHADOW_DEPTH) return el;
  const inner = root.elementFromPoint?.(x, y);
  return inner && inner !== el ? pierce(inner, x, y, depth + 1) : el;
}

/** Topmost host element under a viewport point, skipping the overlay. */
function elementUnder(state: AnnotState, x: number, y: number): Element | null {
  for (const el of state.doc.elementsFromPoint(x, y)) {
    if (isOverlay(el) || IGNORED.has(el.tagName)) continue;
    return pierce(el, x, y);
  }
  return null;
}

const boxArea = (rect: Rect): number => Math.max(0, rect.width) * Math.max(0, rect.height);

/**
 * What a marquee selects: the outermost elements at least half inside it, then one step down for
 * as long as a single container is tiled by children that fill it. A box round a card grid gives
 * the cards; a box round one card gives the card.
 */
function marqueeSelection(state: AnnotState, box: Rect): Element[] {
  const inside = [...(state.doc.body?.querySelectorAll('*') ?? [])].filter((el) => {
    if (isOverlay(el) || IGNORED.has(el.tagName)) return false;
    const rect = docRect(el);
    return rect.width > 8 && rect.height > 8 && coverage(rect, box) >= 0.5;
  });
  let group = inside.filter((el) => !inside.some((other) => other !== el && other.contains(el)));

  while (group.length === 1) {
    const parent = group[0]!;
    const kids = [...parent.children].filter((el) => {
      const rect = docRect(el);
      return rect.width > 8 && rect.height > 8 && coverage(rect, box) >= 0.9;
    });
    const tiled =
      kids.reduce((total, el) => total + boxArea(docRect(el)), 0) / (boxArea(docRect(parent)) || 1);
    if (kids.length === 0 || tiled < 0.7) break;
    group = kids;
  }
  return group.slice(0, 12);
}

export function elementMode(state: AnnotState, layer: HTMLElement): () => void {
  let start: { x: number; y: number } | null = null;

  const onMove = (event: PointerEvent): void => {
    if (start) {
      state.marquee = rectFromPoints(start, docPoint(event, state.scroll));
      return;
    }
    const el = elementUnder(state, event.clientX, event.clientY);
    state.hover = el
      ? { el, rect: docRect(el), label: elementLabelOf(el) }
      : { el: null, rect: null, label: '' };
  };

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    start = docPoint(event, state.scroll);
    layer.setPointerCapture?.(event.pointerId);
  };

  const onUp = (event: PointerEvent): void => {
    if (!start) return;
    const box = rectFromPoints(start, docPoint(event, state.scroll));
    const dragged = box.width > 6 || box.height > 6;
    start = null;
    state.marquee = null;

    if (dragged) {
      const picked = marqueeSelection(state, box);
      state.selection = picked;
      if (picked.length > 0 && !state.inspecting) open(state, picked);
      return;
    }

    const el = elementUnder(state, event.clientX, event.clientY);
    if (!el) {
      state.selection = [];
      return;
    }
    if (event.shiftKey) {
      state.selection = state.selection.includes(el)
        ? state.selection.filter((other) => other !== el)
        : [...state.selection, el];
      return;
    }
    state.selection = [el];
    // Inspecting is its own activity: the note comes from the chip or ⌘↵, not from every click.
    if (!state.inspecting) open(state, [el]);
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

/** Open the popup for the current element selection. */
export function openElementPopup(state: AnnotState): void {
  if (state.selection.length > 0) open(state, state.selection);
}

function open(state: AnnotState, elements: Element[]): void {
  const refs = elements.map((el) => describeElement(el, { styles: state.detail !== 'compact' }));
  const anchor: Rect = unionRects(refs.map((ref) => ref.rect)) ?? refs[0]!.rect;
  state.openPopup('element', { kind: 'element', elements: refs }, anchor);
}
