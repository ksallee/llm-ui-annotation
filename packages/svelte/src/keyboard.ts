import type { Mode } from '@llm-ui-annotation/core';

export type KeyAction =
  | 'palette'
  | 'mode:element'
  | 'mode:text'
  | 'mode:page'
  | 'escape'
  | 'commit'
  | 'panel'
  | 'pause'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'help'
  | `tool:${number}`
  | 'tool:move'
  | 'tool:frame'
  | 'pick'
  | 'walk:parent'
  | 'walk:child'
  | 'walk:previous'
  | 'walk:next';

export interface KeyContext {
  mode: Mode | null;
  popupOpen: boolean;
  dialogOpen: boolean;
  /** The pill is open, which is an explicit act: the overlay has the user's attention. */
  expanded: boolean;
  paletteOpen: boolean;
  panelOpen: boolean;
  focusedDraft: boolean;
  /** A drawing or its strokes are picked, so delete has something nearer to act on. */
  marksPicked: boolean;
  /** An element is selected, which is what the arrow keys walk from. */
  selected: boolean;
  /** The one global binding, as `comboOf` writes it. */
  paletteKey: string;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const MODIFIER_CODES = new Set([
  'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight',
]);
const SYMBOL: Record<string, string> = { Meta: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' };

export const DEFAULT_PALETTE_KEY = 'Alt+KeyA';

function isEditable(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** True while the user is typing, in the host page or in one of our own fields. */
export function isTyping(target: EventTarget | null, overlayHost: Element | null): boolean {
  const el = target as Element | null;
  if (!el || !('tagName' in el)) return false;
  // Events from the shadow root retarget to the host, so ask the root what actually has focus.
  if (overlayHost && (el === overlayHost || overlayHost.contains(el))) {
    return isEditable((overlayHost as HTMLElement).shadowRoot?.activeElement);
  }
  return isEditable(el);
}

/** A layout-independent name for a chord, e.g. `Alt+KeyA`. Empty for a bare modifier. */
export function comboOf(event: KeyboardEvent): string {
  const base = event.code || event.key;
  if (!base || MODIFIER_CODES.has(base)) return '';
  const parts: string[] = [];
  if (event.metaKey) parts.push('Meta');
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(base);
  return parts.join('+');
}

export function formatCombo(combo: string): string {
  const parts = combo.split('+');
  const base = parts.pop() ?? '';
  return parts.map((p) => SYMBOL[p] ?? p).join('') + base.replace(/^(Key|Digit)/, '');
}

/**
 * The action a key event means, or null when the overlay should ignore it. Only the palette key
 * binds while the overlay is idle; everything else needs an active mode or a focused surface.
 */
export function keyAction(event: KeyboardEvent, ctx: KeyContext): KeyAction | null {
  const meta = event.metaKey || event.ctrlKey;
  const combo = comboOf(event);
  if (combo && combo === ctx.paletteKey) return 'palette';
  if (ctx.paletteOpen) return event.key === 'Escape' ? 'escape' : null;

  if (event.key === 'Escape') {
    return ctx.popupOpen || ctx.dialogOpen || ctx.panelOpen || ctx.mode ? 'escape' : null;
  }
  // The popup and the send dialog bind their own ⌘↵. The controller listens on the document in the
  // capture phase, so it would fire first and their stopPropagation would come too late.
  if (meta && event.key === 'Enter') {
    return ctx.popupOpen || ctx.dialogOpen || !ctx.mode ? null : 'commit';
  }

  if (meta && (event.key === 'z' || event.key === 'Z')) {
    if (ctx.mode !== 'page') return null;
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (meta || event.altKey) return null;
  // Scoped, not global: a mode is active, or the user has opened the pill. Otherwise the host
  // page owns the keyboard, and an expanded pill is how you get back into a mode after Esc.
  const engaged = Boolean(ctx.mode) || ctx.expanded;
  if (ctx.popupOpen || ctx.dialogOpen || !engaged) return null;

  if (ctx.mode === 'page') {
    if (event.key >= '1' && event.key <= '6') return `tool:${Number(event.key)}`;
    if (event.key === 'v' || event.key === 'V') return 'tool:move';
    if (event.key === 'f' || event.key === 'F') return 'tool:frame';
  }

  if (ctx.mode === 'element' && (event.key === 'c' || event.key === 'C')) return 'pick';

  // The arrows walk the DOM only with something to walk from; otherwise the page keeps its scroll.
  if (ctx.mode === 'element' && ctx.selected) {
    switch (event.key) {
      case 'ArrowUp':
        return 'walk:parent';
      case 'ArrowDown':
        return 'walk:child';
      case 'ArrowLeft':
        return 'walk:previous';
      case 'ArrowRight':
        return 'walk:next';
    }
  }

  switch (event.key) {
    case 'e':
    case 'E':
      return 'mode:element';
    case 'h':
    case 'H':
      return 'mode:text';
    case 'd':
    case 'D':
      return 'mode:page';
    case 'p':
    case 'P':
      return event.shiftKey ? 'pause' : null;
    case 'i':
    case 'I':
      return 'panel';
    case '?':
      return 'help';
    case 'Backspace':
    case 'Delete':
      return ctx.focusedDraft || ctx.marksPicked ? 'delete' : null;
    default:
      return null;
  }
}

export interface ShortcutEntry {
  keys: string;
  what: string;
  scope: string;
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: '⌥A', what: 'Command palette', scope: 'always' },
  { keys: 'E', what: 'Element mode', scope: 'in a mode' },
  { keys: 'H', what: 'Highlight mode', scope: 'in a mode' },
  { keys: 'D', what: 'Draw mode', scope: 'in a mode' },
  { keys: '⌘↵', what: 'Add annotation, or send the batch', scope: 'in a mode' },
  { keys: 'I', what: 'Toggle the panel', scope: 'in a mode' },
  { keys: '⇧P', what: 'Pause animations', scope: 'in a mode' },
  { keys: 'V', what: 'Move: select and transform a drawing', scope: 'in Draw' },
  { keys: 'F', what: 'Frame: resize the capture box alone', scope: 'in Draw' },
  { keys: '1–6', what: 'Pick a drawing tool', scope: 'in Draw' },
  { keys: '⌘Z / ⇧⌘Z', what: 'Undo / redo a stroke', scope: 'in Draw' },
  { keys: 'C', what: 'Point at elements again, or stop', scope: 'in Element' },
  { keys: '↑ ↓', what: 'Walk to the parent or the first child', scope: 'with a selection' },
  { keys: '← →', what: 'Walk to the previous or next sibling', scope: 'with a selection' },
  { keys: '⌫', what: 'Delete the focused draft', scope: 'in a mode' },
  { keys: '⌘A', what: 'Select every row the filter shows', scope: 'in the panel' },
  { keys: 'Esc', what: 'Close what is open, then the mode', scope: 'on a surface' },
  { keys: '?', what: 'This sheet', scope: 'in a mode' },
];
