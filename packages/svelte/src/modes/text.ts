import { describeRange, isOverlayNode } from '../dom/core-dom.js';
import type { AnnotState } from '../state/annot-state.svelte.js';

/** Native selection stays on the host; we only watch it. */
export function textMode(state: AnnotState): () => void {
  const doc = state.doc;
  const view = doc.defaultView;
  let timer = 0;

  const evaluate = (): void => {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      state.textChip = null;
      return;
    }
    const range = selection.getRangeAt(0);
    if (isOverlayNode(range.commonAncestorContainer)) {
      state.textChip = null;
      return;
    }
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const last = rects.at(-1);
    if (!last) {
      state.textChip = null;
      return;
    }
    const at = {
      x: last.right + state.scroll.x,
      y: last.bottom + state.scroll.y,
      width: 0,
      height: 0,
    };
    const described = describeRange(range, { styles: false });
    if (!described.ok) {
      state.textChip =
        described.reason === 'empty'
          ? null
          : { rect: at, enabled: false, reason: 'select within one paragraph', target: null };
      return;
    }
    state.textChip = { rect: at, enabled: true, reason: '', target: described.target };
  };

  const schedule = (): void => {
    if (!view) return;
    view.clearTimeout(timer);
    timer = view.setTimeout(evaluate, 80);
  };

  doc.addEventListener('selectionchange', schedule);
  doc.addEventListener('mouseup', schedule);
  doc.addEventListener('keyup', schedule);
  return () => {
    view?.clearTimeout(timer);
    doc.removeEventListener('selectionchange', schedule);
    doc.removeEventListener('mouseup', schedule);
    doc.removeEventListener('keyup', schedule);
    state.textChip = null;
  };
}

/** Open the popup for whatever the text chip is pointing at. */
export function openTextPopup(state: AnnotState): void {
  const chip = state.textChip;
  if (!chip?.enabled || !chip.target) return;
  const rects = chip.target.rects;
  const anchor = rects[0] ?? chip.rect;
  state.openPopup('text', chip.target, {
    x: anchor.x,
    y: anchor.y,
    width: anchor.width,
    height: rects.at(-1) ? rects.at(-1)!.y + rects.at(-1)!.height - anchor.y : anchor.height,
  });
}
