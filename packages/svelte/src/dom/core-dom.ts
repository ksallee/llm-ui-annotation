// The single import site for WS 02. Everything DOM-shaped comes from `@llm-ui-annotation/core/dom`;
// the aliases below are the names the overlay uses.

export * from '@llm-ui-annotation/core/dom';

export {
  describeName as elementLabelOf,
  mergeLineRects as mergeRects,
  rectOf as docRect,
} from '@llm-ui-annotation/core/dom';

import { isOverlay } from '@llm-ui-annotation/core/dom';

export const OVERLAY_TAG = 'annot-overlay';

/** `isOverlay` for any node, including text nodes and shadow roots. */
export function isOverlayNode(node: Node | null, overlayTag = OVERLAY_TAG): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof Element) return isOverlay(current, overlayTag);
    current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
  }
  return false;
}
