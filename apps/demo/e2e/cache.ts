import { resolve } from 'node:path';
import { root } from '../vite.config.js';

/**
 * One Vite dependency cache per parallel worker. Sharing a single cache across the concurrent dev
 * servers makes them race the optimizer and serve `504 Outdated Optimize Dep`.
 */
export function cacheDir(index = Number(process.env['TEST_PARALLEL_INDEX'] ?? 0)): string {
  return resolve(root, 'node_modules/.vite-e2e', String(index));
}
