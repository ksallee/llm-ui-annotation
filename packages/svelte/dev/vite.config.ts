import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { mockAnnot } from './mock.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte(), mockAnnot()],
  server: { host: '127.0.0.1' },
});
