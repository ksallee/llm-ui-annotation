import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Annotation, RouteFile } from '@llm-ui-annotation/core';
import { routeFile, validateAnnotation } from '@llm-ui-annotation/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { READER } from './support/build.js';

const SCRIPT = resolve(READER, 'scripts/migrate-notes.mjs');
const FIXTURE = resolve(READER, 'test/fixtures/sit-hathor.notes.json');
const ROUTE = '/doc/essai.md';

let dir = '';
let stdout = '';
let file: RouteFile;

const run = (...args: string[]): string =>
  execFileSync('node', [SCRIPT, ...args], { cwd: READER, encoding: 'utf8' });

const byNumber = (n: number): Annotation =>
  file.annotations.find((a) => a.number === n) as Annotation;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'reader-migrate-'));
  writeFileSync(join(dir, 'essai.md'), '# Essai\n\n## Ouverture\n\nUn paragraphe.\n');
  copyFileSync(FIXTURE, join(dir, 'essai.md.notes.json'));
  stdout = run(join(dir, 'essai.md'));
  file = JSON.parse(readFileSync(join(dir, '.annotations', routeFile(ROUTE)), 'utf8')) as RouteFile;
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('migrate-notes', () => {
  it('prints the counts', () => {
    expect(stdout).toContain('5 migrated · 2 sent · 2 review · 1 approved · 1 skipped');
  });

  it('writes a valid route file', () => {
    expect(file.route).toBe(ROUTE);
    expect(file.nextNumber).toBe(6);
    expect(file.annotations).toHaveLength(5);
    for (const a of file.annotations) expect(validateAnnotation(a)).toEqual([]);
  });

  it('maps pi/section onto a data-annot-block container', () => {
    const first = byNumber(1);
    expect(first.mode).toBe('text');
    expect(first.target.kind).toBe('text');
    if (first.target.kind !== 'text') throw new Error('not a text target');
    expect(first.target.container.selector).toBe('[data-annot-block="ouverture/0"]');
    expect(first.target.quote).toContain("la lumière tombe d'abord sur le seuil");
    expect(first.target.start).toBe(12);
    expect(first.target.end).toBe(58);
  });

  it('maps the three statuses', () => {
    expect(byNumber(1).status).toBe('sent');
    expect(byNumber(3).status).toBe('review');
    expect(byNumber(5).status).toBe('approved');
    expect(byNumber(3).resolution).toEqual({
      kind: 'changed',
      summary: 'Phrase coupée en deux, image conservée.',
    });
    expect(byNumber(4).resolution?.summary).toBe('migrated');
    expect(byNumber(5).approvedAt).not.toBeNull();
  });

  it('keeps the note text as the first thread message', () => {
    const a = byNumber(2);
    expect(a.comment).toBe('Vérifier la concordance des temps avec le paragraphe précédent.');
    expect(a.thread[0]).toMatchObject({ role: 'user', kind: 'comment', text: a.comment });
  });

  it('refuses to overwrite without --force', () => {
    expect(() => run(join(dir, 'essai.md'))).toThrow(/already exists/);
    expect(run(join(dir, 'essai.md'), '--force')).toContain('5 migrated');
  });
});
