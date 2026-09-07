import type { Component } from 'svelte';
import type { AnnotatorProps } from './options.js';
import AnnotatorComponent from './ui/Annotator.svelte';

/** The overlay as a plain Svelte component, for hosts that mount it themselves. */
export const Annotator = AnnotatorComponent as unknown as Component<AnnotatorProps>;

export { OVERLAY_TAG } from './dom/core-dom.js';
export { AnnotOverlayElement, defineOverlay } from './element.js';
export { mount, type MountedOverlay } from './mount.js';
export { autoMount } from './auto-mount.js';
export { createState } from './create.js';
export { VERSION } from './version.js';

export {
  ATTRIBUTES,
  optionsFromAttributes,
  routeOf,
  type AnnotatorProps,
  type Corner,
  type DetailLevel,
  type HotLike,
  type MarkerVisibility,
  type OverlayOptions,
  type SendMode,
} from './options.js';

export {
  AnnotState,
  type Anchor,
  type AnnotStateOptions,
  type Connection,
  type Filter,
  type HoverState,
  type PendingDrawing,
  type PopupState,
  type TextChip,
  type Toast,
} from './state/annot-state.svelte.js';

export { DEFAULT_PREFS, loadPrefs, PREFS_KEY, savePrefs, type Prefs } from './state/prefs.js';
export { AnnotClient, AnnotHttpError, type Fetch } from './transport/client.js';
export { connectLive, type LiveOptions } from './transport/live.js';
export { isTyping, keyAction, SHORTCUTS, type KeyAction, type KeyContext } from './keyboard.js';
export {
  clearHighlights,
  ensureHighlightStyle,
  paintHighlights,
  supportsHighlights,
} from './dom/highlights.js';
export {
  coverage,
  cornerStyle,
  docPoint,
  nearestCorner,
  place,
  rectFromPoints,
  relativeTime,
  sample,
  smoothPath,
  unionRects,
  type Point,
  type Size,
} from './dom/geometry.js';
export { ICONS, type IconName } from './icons.js';
export { domToCanvas, provideDomToCanvas, type DomToCanvas } from './screenshot.js';
