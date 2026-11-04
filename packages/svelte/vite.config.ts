import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        auto: 'src/auto.ts',
        'theme/index': 'src/theme/index.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'svelte',
        /^svelte\//,
        /^@llm-ui-annotation\/core/,
      ],
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
