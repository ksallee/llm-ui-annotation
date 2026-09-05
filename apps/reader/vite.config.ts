import { dirname, join } from 'node:path';
import { annotations } from '@llm-ui-annotation/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { docRoute, readerDoc, resolveDoc } from './vite-doc-plugin.js';

const root = import.meta.dirname;
const doc = resolveDoc(root);

const SCREENSHOT = 'modern-screenshot';
const STUB = '\0virtual:modern-screenshot';

/**
 * The overlay's screenshot import is an optional peer, but Vite's import analysis still has to
 * resolve it. Stub it when it is not installed; the overlay then saves strokes without a capture.
 */
function optionalScreenshot(): Plugin {
  return {
    name: 'reader-optional-screenshot',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (id !== SCREENSHOT) return null;
      const real = await this.resolve(id, importer, { ...options, skipSelf: true });
      return real ?? STUB;
    },
    load(id) {
      return id === STUB ? 'export const domToCanvas = undefined;' : null;
    },
  };
}

export default defineConfig({
  root,
  plugins: [
    optionalScreenshot(),
    svelte(),
    readerDoc({ doc }),
    annotations({
      dir: process.env['ANNOT_DIR'] ?? join(dirname(doc), '.annotations'),
      inject: false,
      routeKey: () => docRoute(doc),
    }),
  ],
  server: { host: '127.0.0.1' },
});
