/** Ancestor walks: the chain that steps out of open shadow roots, and the overlay test. */

export const DEFAULT_OVERLAY_TAG = 'annot-overlay';

/** `el` and every ancestor, shadow hosts included, nearest first. */
export function ancestorChain(el: Element): Element[] {
  const out: Element[] = [];
  let current: Element | null = el;
  while (current) {
    out.push(current);
    const root = current.getRootNode();
    current = current.parentElement ?? (root.nodeType === 11 ? (root as ShadowRoot).host : null);
  }
  return out;
}

/** True when `el` is the overlay host or sits inside it. */
export function isOverlay(el: Element, overlayTag = DEFAULT_OVERLAY_TAG): boolean {
  const tag = overlayTag.toUpperCase();
  for (let current: Element | null = el; current; current = current.parentElement) {
    if (current.tagName === tag) return true;
  }
  return false;
}
