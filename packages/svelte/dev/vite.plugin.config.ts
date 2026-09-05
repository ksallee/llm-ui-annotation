import { annotations } from '@llm-ui-annotation/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The same dev page against the real plugin instead of dev/mock.ts. Storage goes to ANNOT_DIR.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte(), annotations({ accent: '#2C8A85', inject: false })],
  server: { host: '127.0.0.1' },
});
