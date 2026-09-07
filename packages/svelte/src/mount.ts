import { OVERLAY_TAG } from './dom/core-dom.js';
import { defineOverlay, type AnnotOverlayElement } from './element.js';
import type { OverlayOptions } from './options.js';
import type { AnnotState } from './state/annot-state.svelte.js';

export interface MountedOverlay {
  element: AnnotOverlayElement;
  get state(): AnnotState | null;
  destroy(): void;
}

/** Append `<annot-overlay>` to the page and return a handle. */
export function mount(options: OverlayOptions = {}): MountedOverlay {
  defineOverlay();
  const doc = options.doc ?? globalThis.document;
  const existing = doc.querySelector(OVERLAY_TAG) as AnnotOverlayElement | null;
  const element = existing ?? (doc.createElement(OVERLAY_TAG) as AnnotOverlayElement);
  element.options = options;
  if (existing) element.applyOptions(options);
  else (options.target ?? doc.body).append(element);
  return {
    element,
    get state() {
      return element.state;
    },
    destroy() {
      element.remove();
    },
  };
}
