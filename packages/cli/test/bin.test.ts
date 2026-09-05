import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PROTOCOL_VERSION } from '@llm-ui-annotation/core';
import { describe, expect, it } from 'vitest';
import { IDS, makeFixture } from './fixtures.js';

const run = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.js');

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

async function annot(dir: string, ...argv: string[]): Promise<Ran> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...argv, '--dir', dir]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('the annot binary', () => {
  it('prints pending items', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'pending');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('## /pricing');
    expect(res.stderr).toContain('dev server not running');
  });

  it('exits 124 when watch times out, with no stdout', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'watch', '--from-now', '--timeout', '1');
    expect(res.code).toBe(124);
    expect(res.stdout).toBe('');
  });

  it('exits 2 on an illegal transition', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'ack', IDS.c);
    expect(res.code).toBe(2);
  });

  it('exits 0 for --help and --version', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir, '--help')).code).toBe(0);
    expect((await annot(dir, '--version')).stdout).toContain(`protocol ${PROTOCOL_VERSION}`);
  });
});
