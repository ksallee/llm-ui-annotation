import { mount, type MountedOverlay } from './mount.js';
import type { OverlayOptions } from './options.js';

declare global {
  var __ANNOT_OPTIONS__: OverlayOptions | undefined;
}

let claimed = false;

/**
 * Mount the overlay once the document is parsed. Idempotent; the first call wins. Importing this
 * module mounts with `globalThis.__ANNOT_OPTIONS__` unless something calls `autoMount` first.
 */
export function autoMount(options: OverlayOptions = {}): Promise<MountedOverlay | null> {
  claimed = true;
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
