import { resolve } from 'node:path';
import { annotations } from '@llm-ui-annotation/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type UserConfig } from 'vite';

export const root = import.meta.dirname;

const PAGES = [
  'index.html',
  'app/index.html',
  'prose/index.html',
  'layout/index.html',
  'hostile/index.html',
];

const page = (name: string): string => resolve(root, name);

/** No `accent`: the overlay follows the host's `--annot-accent`, which the demo nav writes live. */
export function demoConfig(dir?: string): UserConfig {
  return {
    root,
    plugins: [svelte(), annotations(dir === undefined ? {} : { dir })],
    server: { host: '127.0.0.1' },
    // Explicit, so nothing is discovered lazily and reloads the page mid-test.
    optimizeDeps: {
      entries: PAGES.map((name) => page(name)),
    },
    build: {
      rollupOptions: {
        input: Object.fromEntries(PAGES.map((name) => [name.replace(/\/?index\.html$/, '') || 'home', page(name)])),
      },
    },
  };
}

export default defineConfig(demoConfig());
