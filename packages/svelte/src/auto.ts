import { mount, type MountedOverlay } from './mount.js';
import type { HotLike, OverlayOptions } from './options.js';

declare global {
  var __ANNOT_OPTIONS__: OverlayOptions | undefined;
  /** `import.meta.hot` handed over by the Vite plugin's virtual module; enables push updates. */
  var __ANNOT_HOT__: HotLike | undefined;
}

let claimed = false;

/**
 * Mount the overlay once the document is parsed. Idempotent; the first call wins. Importing this
 * module mounts with `globalThis.__ANNOT_OPTIONS__` unless something calls `autoMount` first.
 */
export function autoMount(input: OverlayOptions = {}): Promise<MountedOverlay | null> {
  claimed = true;
  const hot = input.hot ?? globalThis.__ANNOT_HOT__ ?? null;
  const options: OverlayOptions = { ...input, hot };
  const doc = options.doc ?? globalThis.document;
  if (!doc) return Promise.resolve(null);
  if (doc.readyState === 'loading') {
    return new Promise((done) => {
      doc.addEventListener('DOMContentLoaded', () => done(mount(options)), { once: true });
    });
  }
  return Promise.resolve(mount(options));
}

queueMicrotask(() => {
  if (!claimed) void autoMount(globalThis.__ANNOT_OPTIONS__ ?? {});
});
