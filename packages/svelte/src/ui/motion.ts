export interface DropParams {
  duration: number;
}

/** Fade and drop a horizontally centred bar in, honouring the reduced-motion preference. */
export function drop(node: Element, { duration }: DropParams): { duration: number; css(t: number): string } {
  const reduced = node.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    duration: reduced ? 0 : duration,
    css: (t) => `opacity: ${t}; transform: translate(-50%, ${(t - 1) * 10}px)`,
  };
}
