import { ensureBuilt } from './build.js';

export default function setup(): void {
  ensureBuilt('@llm-ui-annotation/core', 'packages/core/dist/index.js');
  ensureBuilt('@llm-ui-annotation/vite-plugin', 'packages/vite-plugin/dist/index.js');
  ensureBuilt('@llm-ui-annotation/svelte', 'packages/svelte/dist/index.js');
  ensureBuilt('@llm-ui-annotation/cli', 'packages/cli/dist/bin.js');
}
