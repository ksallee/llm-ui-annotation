// Importing this module mounts the overlay. Everything importable without that side effect lives in
// auto-mount.ts, so the package barrel can re-export autoMount without mounting anything.
import { autoMount } from './auto-mount.js';

export { autoMount };

void autoMount(globalThis.__ANNOT_OPTIONS__ ?? {});
