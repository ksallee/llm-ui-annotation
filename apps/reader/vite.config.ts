import { dirname, join } from 'node:path';
import { annotations } from '@llm-ui-annotation/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { docRoute, readerDoc, resolveDoc } from './vite-doc-plugin.js';

const root = import.meta.dirname;
const doc = resolveDoc(root);

export default defineConfig({
  root,
  plugins: [
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
