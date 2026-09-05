const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep tab focus inside the node and hand it back to whatever had it. */
export function trapFocus(node: HTMLElement): { destroy(): void } {
  const previous = node.ownerDocument.activeElement as HTMLElement | null;

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items.at(-1)!;
    const root = node.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  node.addEventListener('keydown', onKeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      previous?.focus?.();
    },
  };
}
