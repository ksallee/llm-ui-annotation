import { describeRange, isOverlayNode } from '../dom/core-dom.js';
import type { AnnotState } from '../state/annot-state.svelte.js';

const MODIFIERS = new Set(['Shift', 'Meta', 'Control', 'Alt']);

/** Native selection stays on the host; we only watch it. */
export function textMode(state: AnnotState): () => void {
  const doc = state.doc;
  const view = doc.defaultView;
  let timer = 0;
  // Set by a mouse release on the page: that selection is finished, so its note opens at once.
  let released = false;
  // The last real selection. Writing in the note clears the page's, and shift+click extends this one.
  let held: Range | null = null;

  const evaluate = (): void => {
    const open = released;
    released = false;
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
          : { rect: at, enabled: false, reason: 'that is the whole page', target: null };
      return;
    }
    state.textChip = { rect: at, enabled: true, reason: '', target: described.target };
    held = range.cloneRange();
    if (open && canReplacePopup(state)) openTextPopup(state);
  };

  const schedule = (): void => {
    if (!view) return;
    view.clearTimeout(timer);
    timer = view.setTimeout(evaluate, 80);
  };

  const onMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0 || isOverlayNode(event.target as Node | null)) return;
    released = true;
    schedule();
  };

  const onMouseDown = (event: MouseEvent): void => {
    if (!event.shiftKey || event.button !== 0 || !held || !state.popup || !canReplacePopup(state)) return;
    if (isOverlayNode(event.target as Node | null)) return;
    const point = caretAt(doc, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    const range = extend(doc, held, point);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    // Letting go of the shift that extended a click is still the mouse's selection.
    if (MODIFIERS.has(event.key)) return;
    released = false;
    schedule();
  };

  doc.addEventListener('selectionchange', schedule);
  doc.addEventListener('mousedown', onMouseDown);
  doc.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('keyup', onKeyUp);
  return () => {
    view?.clearTimeout(timer);
    doc.removeEventListener('selectionchange', schedule);
    doc.removeEventListener('mousedown', onMouseDown);
    doc.removeEventListener('mouseup', onMouseUp);
    doc.removeEventListener('keyup', onKeyUp);
    state.textChip = null;
  };
}

interface Caret {
  node: Node;
  offset: number;
}

/** The text position under a viewport point. */
function caretAt(doc: Document, x: number, y: number): Caret | null {
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** `from` grown to reach `to`, on whichever side `to` falls. */
function extend(doc: Document, from: Range, to: Caret): Range {
  const range = doc.createRange();
  if (from.comparePoint(to.node, to.offset) < 0) {
    range.setStart(to.node, to.offset);
    range.setEnd(from.endContainer, from.endOffset);
  } else {
    range.setStart(from.startContainer, from.startOffset);
    range.setEnd(to.node, to.offset);
  }
  return range;
}

/** No note open, or an empty text note that a new selection may take over. */
function canReplacePopup(state: AnnotState): boolean {
  const popup = state.popup;
  if (!popup) return true;
  return popup.mode === 'text' && !popup.editing && !popup.draftId && !popup.comment.trim();
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
