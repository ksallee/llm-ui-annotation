import { mount, type MountedOverlay } from './mount.js';
import type { HotLike, OverlayOptions } from './options.js';

declare global {
  var __ANNOT_OPTIONS__: OverlayOptions | undefined;
  /** `import.meta.hot` handed over by the Vite plugin's virtual module; enables push updates. */
  var __ANNOT_HOT__: HotLike | undefined;
}

let mounted: Promise<MountedOverlay | null> | null = null;

/** Mount the overlay once the document is parsed. Idempotent; the first call wins. */
export function autoMount(input: OverlayOptions = {}): Promise<MountedOverlay | null> {
  if (mounted) return mounted;
  const hot = input.hot ?? globalThis.__ANNOT_HOT__ ?? null;
  const options: OverlayOptions = { ...input, hot };
  const doc = options.doc ?? globalThis.document;
  if (!doc) return Promise.resolve(null);
  mounted =
    doc.readyState === 'loading'
      ? new Promise((done) => {
          doc.addEventListener('DOMContentLoaded', () => done(mount(options)), { once: true });
        })
      : Promise.resolve(mount(options));
  return mounted;
}
