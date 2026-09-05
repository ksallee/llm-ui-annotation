import type { Mode } from '@llm-ui-annotation/core';

export type KeyAction =
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
  | 'help';

export interface KeyContext {
  mode: Mode | null;
  popupOpen: boolean;
  dialogOpen: boolean;
  focusedDraft: boolean;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True while the user is typing somewhere that is not our own overlay. */
export function isTyping(target: EventTarget | null, overlayHost: Element | null): boolean {
  const el = target as Element | null;
  if (!el || !('tagName' in el)) return false;
  if (overlayHost && (el === overlayHost || overlayHost.contains(el))) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** The action a key event means, or null when the overlay should ignore it. */
export function keyAction(event: KeyboardEvent, ctx: KeyContext): KeyAction | null {
  const meta = event.metaKey || event.ctrlKey;

  if (event.key === 'Escape') return 'escape';
  // The popup and the send dialog bind their own ⌘↵. The controller listens on the document in the
  // capture phase, so it would fire first and their stopPropagation would come too late.
  if (meta && event.key === 'Enter') return ctx.popupOpen || ctx.dialogOpen ? null : 'commit';

  if (meta && (event.key === 'z' || event.key === 'Z')) {
    if (ctx.mode !== 'page') return null;
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (meta || event.altKey) return null;
  if (ctx.popupOpen || ctx.dialogOpen) return null;

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

export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: 'E', what: 'Element mode' },
  { keys: 'H', what: 'Highlight mode' },
  { keys: 'D', what: 'Draw mode' },
  { keys: 'Esc', what: 'Exit mode, close popup or panel' },
  { keys: '⌘↵', what: 'Add annotation, or send the batch' },
  { keys: 'I', what: 'Toggle the panel' },
  { keys: '⇧P', what: 'Pause animations' },
  { keys: '⌘Z / ⇧⌘Z', what: 'Undo / redo a stroke' },
  { keys: '⌫', what: 'Delete the focused draft' },
  { keys: '?', what: 'This sheet' },
];
