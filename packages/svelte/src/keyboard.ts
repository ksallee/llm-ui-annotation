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
  | `tool:${number}`;

export interface KeyContext {
  mode: Mode | null;
  popupOpen: boolean;
  dialogOpen: boolean;
  paletteOpen: boolean;
  panelOpen: boolean;
  focusedDraft: boolean;
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

/** True while the user is typing somewhere that is not our own overlay. */
export function isTyping(target: EventTarget | null, overlayHost: Element | null): boolean {
  const el = target as Element | null;
  if (!el || !('tagName' in el)) return false;
  if (overlayHost && (el === overlayHost || overlayHost.contains(el))) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  return el instanceof HTMLElement && el.isContentEditable;
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
  if (ctx.popupOpen || ctx.dialogOpen || !ctx.mode) return null;

  if (ctx.mode === 'page' && event.key >= '1' && event.key <= '6') {
    return `tool:${Number(event.key)}`;
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
      return ctx.focusedDraft ? 'delete' : null;
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
  { keys: '1–6', what: 'Pick a drawing tool', scope: 'in Draw' },
  { keys: '⌘Z / ⇧⌘Z', what: 'Undo / redo a stroke', scope: 'in Draw' },
  { keys: '⌫', what: 'Delete the focused draft', scope: 'in a mode' },
  { keys: '⌘A', what: 'Select every row the filter shows', scope: 'in the panel' },
  { keys: 'Esc', what: 'Exit mode, close popup or panel', scope: 'on a surface' },
  { keys: '?', what: 'This sheet', scope: 'in a mode' },
];
