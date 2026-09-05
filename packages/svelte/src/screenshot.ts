export type DomToCanvas = (
  node: Element,
  options: { scale: number; timeout: number },
) => Promise<HTMLCanvasElement>;

const GLOBAL = '__ANNOT_DOM_TO_CANVAS__';
const SPECIFIER = '__ANNOT_SCREENSHOT_MODULE__';
const DEFAULT_SPECIFIER = 'modern-screenshot';

type Registry = Record<string, unknown>;

/** Register the page-mode capture backend, normally `domToCanvas` from `modern-screenshot`. */
export function provideDomToCanvas(fn: DomToCanvas | null): void {
  (globalThis as Registry)[GLOBAL] = fn ?? undefined;
}

/**
 * The capture backend, or `null` when the optional peer is not around.
 *
 * The specifier is read at call time so no bundler can turn it into a static import: a host that
 * does not install `modern-screenshot` must still get a working overlay.
 */
export async function domToCanvas(): Promise<DomToCanvas | null> {
  const registered = (globalThis as Registry)[GLOBAL];
  if (typeof registered === 'function') return registered as DomToCanvas;
  const override = (globalThis as Registry)[SPECIFIER];
  const specifier = typeof override === 'string' ? override : DEFAULT_SPECIFIER;
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as { domToCanvas?: DomToCanvas };
    return mod.domToCanvas ?? null;
  } catch {
    return null;
  }
}
