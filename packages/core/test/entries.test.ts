import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as browser from '../src/index.js';
import * as model from '../src/model/index.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p)));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('entry separation', () => {
  it('keeps node builtins out of everything but src/node', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(SRC)) {
      if (file.includes(`${join('src', 'node')}`)) continue;
      if (/from '(node:|fs|path|os)/.test(await readFile(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps window and document out of the model and the protocol', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(SRC)) {
      if (file.includes(`${join('src', 'node')}`)) continue;
      const code = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const dom = file.includes(`${join('src', 'dom')}`);
      if (/(^|[^.\w])(window|document)\s*[.[]/.test(code)) offenders.push(file);
      else if (!dom && /\bHTML[A-Za-z]*Element\b/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('has no runtime dependencies', async () => {
    const pkg = JSON.parse(await readFile(join(SRC, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toBeUndefined();
  });

  it('re-exports the whole model from the package entry', () => {
    for (const name of Object.keys(model)) expect(browser).toHaveProperty(name);
  });

  it('exports the protocol constants downstream packages key off', () => {
    expect(browser.PROTOCOL_VERSION).toBe(4);
    expect(browser.DEFAULT_DIR).toBe('.annotations');
    expect(browser.DEFAULT_BASE_PATH).toBe('/__annot');
  });
});
