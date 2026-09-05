import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const REPO = resolve(import.meta.dirname, '../../../..');
export const READER = resolve(REPO, 'apps/reader');

/** Build `filter` when `output` is missing, so `pnpm test` works without a prior `pnpm check`. */
export function ensureBuilt(filter: string, output: string): string {
  const path = resolve(REPO, output);
  if (!existsSync(path)) {
    execFileSync('pnpm', ['--filter', filter, 'build'], { cwd: REPO, stdio: 'inherit' });
  }
  return path;
}
