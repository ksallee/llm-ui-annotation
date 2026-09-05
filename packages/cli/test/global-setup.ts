import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..');
const root = join(cli, '..', '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

/** Build core and the CLI so the child-process tests have a real `dist/bin.js`. */
export function setup(): void {
  execFileSync(process.execPath, [tsc, '-p', join(cli, '..', 'core', 'tsconfig.build.json')], {
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [tsc, '-p', join(cli, 'tsconfig.build.json')], { stdio: 'inherit' });
}
