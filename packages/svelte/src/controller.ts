import type { Rect, Status, Stroke, Target } from '@llm-ui-annotation/core';
import { captureRegion, freezeAnimations, isOverlayNode } from './dom/core-dom.js';
import { paintHighlights, supportsHighlights } from './dom/highlights.js';
import { isTyping, keyAction } from './keyboard.js';
import { DRAW_TOOLS } from './draw-tools.js';
import { openElementPopup, openPagePopup, openTextPopup } from './modes/index.js';
import { domToCanvas } from './screenshot.js';
import type { AnnotState } from './state/annot-state.svelte.js';
import { filesOf, isFileDrag } from './ui/drop.js';
import { formatOklch, parseColor, type ThemeTokens } from '@llm-ui-annotation/core/theme';

/** Scroll position, re-anchoring and the mutation watchdog. */
export function watchViewport(state: AnnotState): () => void {
  const doc = state.doc;
  const view = doc.defaultView;
  if (!view) return () => {};
  let frame = 0;
  let timer = 0;

  const sync = (): void => {
    if (frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      state.scroll = { x: view.scrollX, y: view.scrollY };
      state.reanchor();
    });
  };

  const lazy = (): void => {
    view.clearTimeout(timer);
    timer = view.setTimeout(() => state.reanchor(), 300);
  };

  view.addEventListener('scroll', sync, { passive: true, capture: true });
  view.addEventListener('resize', sync, { passive: true });

  const resizeObserver = new view.ResizeObserver(lazy);
  if (doc.body) resizeObserver.observe(doc.body);

  const mutationObserver = new view.MutationObserver((records) => {
    if (records.every((record) => isOverlayNode(record.target))) return;
    lazy();
  });
  if (doc.body) {
    mutationObserver.observe(doc.body, { childList: true, subtree: true, characterData: true });
  }

  state.scroll = { x: view.scrollX, y: view.scrollY };
  return () => {
    view.cancelAnimationFrame(frame);
    view.clearTimeout(timer);
    view.removeEventListener('scroll', sync, { capture: true });
    view.removeEventListener('resize', sync);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}

export interface KeyActions {
  commit(): void;
}

export function bindKeys(state: AnnotState, host: Element | null, actions: KeyActions): () => void {
  const doc = state.doc;

  const onKeyDown = (event: KeyboardEvent): void => {
    // Escape still gets through while typing; it is how you leave the field you are in.
    if ((isTyping(event.target, host) && event.key !== 'Escape') || state.capturingKey) return;
    const focused = state.focusedId ? state.annotations.get(state.focusedId) : null;
    const action = keyAction(event, {
      mode: state.mode,
      popupOpen: Boolean(state.popup),
      dialogOpen: state.sendOpen || state.settingsOpen || state.shortcutsOpen,
      expanded: state.prefs.expanded,
      paletteOpen: state.paletteOpen,
      panelOpen: state.prefs.panelOpen,
      focusedDraft: focused?.status === 'draft',
      marksPicked: state.marksPicked,
      paletteKey: state.prefs.paletteKey,
    });
    if (!action) return;

    if (action.startsWith('tool:')) {
      const name = action.slice(5);
      if (name === 'move' || name === 'frame') state.drawTool = name;
      else {
        const tool = DRAW_TOOLS[Number(name) - 1];
        if (tool) state.drawTool = tool.tool;
      }
      event.preventDefault();
      return;
    }

    switch (action) {
      case 'palette':
        state.togglePalette();
        break;
      case 'escape':
        if (state.paletteOpen) state.togglePalette(false);
        else if (state.labelDraft) state.labelDraft = null;
        else if (state.popup) state.closePopup();
        else if (state.sendOpen || state.settingsOpen || state.shortcutsOpen) {
          state.sendOpen = false;
          state.settingsOpen = false;
          state.shortcutsOpen = false;
        } else if (state.mode === 'page' && state.stepOutDraw()) {
          // inside a drawing → that drawing selected → nothing selected → leave Draw
        } else if (state.mode === 'element' && state.selection.length > 0) state.selection = [];
        else if (state.prefs.panelOpen) state.togglePanel(false);
        else if (state.mode) state.setMode(null);
        else state.collapse();
        break;
      case 'commit':
        actions.commit();
        break;
      case 'mode:element':
        state.setMode('element');
        break;
      case 'mode:text':
        state.setMode('text');
        break;
      case 'mode:page':
        state.setMode('page');
        break;
      case 'panel':
        state.togglePanel();
        break;
      case 'pause':
        state.frozen = !state.frozen;
        break;
      case 'undo':
        state.undoStroke();
        break;
      case 'redo':
        state.redoStroke();
        break;
      case 'delete':
        // Picked marks first: otherwise ⌫ inside a drawing deleted the whole annotation.
        if (!state.deleteSelectedMarks() && state.focusedId) void state.deleteNote(state.focusedId);
        break;
      case 'help':
        state.shortcutsOpen = true;
        break;
    }
    event.preventDefault();
  };

  const onModifier = (event: KeyboardEvent): void => {
    state.passthrough = event.metaKey || event.ctrlKey;
  };

  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('keydown', onModifier, true);
  doc.addEventListener('keyup', onModifier, true);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('keydown', onModifier, true);
    doc.removeEventListener('keyup', onModifier, true);
  };
}

/** Hand text ranges to the CSS Custom Highlight API, grouped by status. */
export function paintTextHighlights(state: AnnotState): void {
  if (!supportsHighlights(state.doc)) return;
  const byStatus = new Map<Status, Range[]>();
  for (const a of state.visible) {
    if (a.mode !== 'text') continue;
    const range = state.anchors.get(a.id)?.range;
    if (!range) continue;
    const list = byStatus.get(a.status) ?? [];
    list.push(range);
    byStatus.set(a.status, list);
  }
  paintHighlights(state.doc, byStatus);
}

const SCROLL_KEYS = new Set([
  'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
]);

/**
 * Hold the page still while a drawing is open. A drawing is anchored in document coordinates, so
 * scrolling mid-drawing would stretch one note across a screenful it never meant to cover. Events
 * are suppressed rather than styles changed: the host page's DOM is never ours to touch.
 */
export function holdScroll(state: AnnotState, host: Element | null, held: boolean): () => void {
  const doc = state.doc;
  const view = doc.defaultView;
  if (!held || !view) return () => {};
  const stop = (event: Event): void => event.preventDefault();
  const stopKeys = (event: KeyboardEvent): void => {
    if (isTyping(event.target, host) || !SCROLL_KEYS.has(event.key)) return;
    event.preventDefault();
  };
  view.addEventListener('wheel', stop, { passive: false });
  view.addEventListener('touchmove', stop, { passive: false });
  doc.addEventListener('keydown', stopKeys);
  return () => {
    view.removeEventListener('wheel', stop);
    view.removeEventListener('touchmove', stop);
    doc.removeEventListener('keydown', stopKeys);
  };
}

export function freezeWhile(state: AnnotState, frozen: boolean): () => void {
  if (!frozen) return () => {};
  return freezeAnimations(state.doc);
}

/** The five drawing colours the theme derives from the accent. */
export function drawingPalette(tokens: ThemeTokens): string[] {
  return [
    tokens['--annot-stroke-1'],
    tokens['--annot-stroke-2'],
    tokens['--annot-stroke-3'],
    tokens['--annot-stroke-4'],
    tokens['--annot-stroke-5'],
  ];
}

/** Six accents around the colour wheel, at the current accent's lightness and chroma. */
export function accentSuggestions(tokens: ThemeTokens): string[] {
  const accent = parseColor(tokens['--annot-accent']);
  const l = accent?.l ?? 0.62;
  const c = Math.max(0.08, accent?.c ?? 0.16);
  const base = accent?.h ?? 250;
  return [0, 60, 120, 180, 240, 300].map((step) =>
    formatOklch({ l, c, h: (base + step) % 360, alpha: 1 }),
  );
}

/** Files dropped on the page itself land on the note being written. */
export function watchPageDrops(state: AnnotState): () => void {
  const doc = state.doc;
  const view = doc.defaultView;
  if (!view) return () => {};
  let timer = 0;

  // dragover repeats for as long as the drag lives, so its silence is what ends the affordance;
  // dragleave fires at every element boundary and cannot be trusted for it.
  const idle = (): void => {
    view.clearTimeout(timer);
    timer = view.setTimeout(() => (state.pageDrop = false), 160);
  };

  const over = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    state.pageDrop = true;
    idle();
  };

  const drop = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    view.clearTimeout(timer);
    state.pageDrop = false;
    const files = filesOf(event);
    if (files.length === 0) return;
    if (!state.popup) {
      state.toast('Nothing is being written — drop the file on a note, or on its row in the panel');
      return;
    }
    void state.popupAnnotation().then((id) => (id ? state.attach(id, files) : undefined));
  };

  doc.addEventListener('dragover', over);
  doc.addEventListener('drop', drop);
  return () => {
    view.clearTimeout(timer);
    state.pageDrop = false;
    doc.removeEventListener('dragover', over);
    doc.removeEventListener('drop', drop);
  };
}

/** Turn the popup into an annotation, capturing a screenshot for page targets. */
export async function commitPopup(state: AnnotState): Promise<void> {
  const popup = state.popup;
  if (!popup || popup.busy) return;
  const comment = popup.comment.trim();
  if (!comment) return;
  popup.busy = true;

  if (popup.editing) {
    await state.editComment(popup.editing, comment);
    state.closePopup();
    popup.busy = false;
    return;
  }

  let target: Target = popup.target;
  // A file dropped while writing created the draft already, so it had somewhere to land.
  const created = popup.draftId
    ? await state.finishDraft(popup.draftId, comment)
    : await state.add(popup.mode, target, comment);
  popup.draftId = null;

  if (target.kind === 'page') {
    const png = await capturePage(state, target.region, target.strokes);
    if (png) {
      try {
        const { path } = await state.client.screenshot(created.id, png);
        target = { ...target, screenshot: path };
        const current = state.annotations.get(created.id);
        if (current) state.applyLocal({ ...current, target });
      } catch {
        state.toast('Saved without screenshot; strokes kept');
      }
    } else {
      state.toast('Saved without screenshot; strokes kept');
    }
    state.clearDrawing();
  }

  if (popup.mode === 'element') state.selection = [];
  if (popup.mode === 'text') {
    state.textChip = null;
    state.doc.getSelection()?.removeAllRanges();
  }

  state.closePopup();
  state.reanchor();
}

/** A PNG of the region with its marks drawn on, or null when the backend is missing. */
export async function capturePage(state: AnnotState, region: Rect, strokes: Stroke[]): Promise<Blob | null> {
  const backend = await domToCanvas();
  if (!backend) return null;
  try {
    return await captureRegion(state.doc, region, strokes, { domToCanvas: backend });
  } catch {
    return null;
  }
}

/** What ⌘↵ means right now. */
export function primaryAction(state: AnnotState): void {
  if (state.popup) {
    void commitPopup(state);
    return;
  }
  if (state.labelDraft) return;
  if (state.mode === 'text' && state.textChip?.enabled) {
    openTextPopup(state);
    return;
  }
  if (state.mode === 'page' && state.drawing.strokes.length > 0) {
    openPagePopup(state);
    return;
  }
  if (state.mode === 'element' && state.selection.length > 0) {
    openElementPopup(state);
    return;
  }
  if (state.sendMode === 'batch' && state.drafts.length > 0) state.openSend();
}

/** Centre the annotation's target in the viewport and show its card. */
export const LOCATE_KEY = 'annot:locate';

export function locate(state: AnnotState, id: string): void {
  const annotation = state.annotations.get(id);
  const view = state.doc.defaultView;
  if (!view || !annotation) return;

  // Anchors only exist for the route in the DOM right now, so another route has to be visited first.
  if (annotation.route !== state.route) {
    try {
      view.sessionStorage?.setItem(LOCATE_KEY, id);
    } catch {
      // private mode; the target route still opens, just without the flash
    }
    view.location.assign(annotation.route);
    return;
  }

  const rect = state.anchors.get(id)?.rects[0];
  if (!rect) {
    state.toast('That annotation has lost its anchor on this page');
    return;
  }
  view.scrollTo({
    top: Math.max(0, rect.y - view.innerHeight / 2 + rect.height / 2),
    left: 0,
    behavior: 'smooth',
  });
  state.hoverCard = id;
  view.setTimeout(() => {
    if (state.hoverCard === id) state.hoverCard = null;
  }, 2000);
}
