/** `POST /replace`: write the user's own text into the page's source, then record it. */

import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  applyReplacement,
  LIMITS,
  makeMessage,
  newId,
  nowIso,
  PROTOCOL_VERSION,
  validateAnnotation,
  type Annotation,
  type ReplaceRefusal,
  type ReplaceRequest,
} from '@llm-ui-annotation/core';
import { writeFileAtomic } from '@llm-ui-annotation/core/node';
import { badRequest, conflict, notFound } from './errors.js';
import type { ResolvedOptions } from './options.js';
import type { Store } from './store.js';

const REFUSALS: Record<ReplaceRefusal, (file: string) => string> = {
  'not-found': (file) => `${file} changed since this text was selected; reload the page and select it again`,
  ambiguous: (file) => `the selected text appears more than once in ${file}; select a longer run`,
  formatted: (file) => `the selection crosses formatting in ${file}; edit the file directly`,
};

/** Writes to one file run one after another, so two replacements never read the same old text. */
const chains = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
  chains.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

/** Apply a replacement to the source behind `body.route` and store it as a `replace` annotation. */
export async function replaceInSource(store: Store, options: ResolvedOptions, input: unknown): Promise<Annotation> {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Partial<ReplaceRequest>;
  if (typeof body.route !== 'string') throw badRequest('route: expected string');
  if (typeof body.replacement !== 'string') throw badRequest('replacement: expected string');
  if (body.replacement.length > LIMITS.text) throw badRequest(`replacement: expected at most ${LIMITS.text} characters`);

  const configured = options.sourceFile?.(body.route);
  if (!configured) throw notFound(`no source file for ${body.route.slice(0, 200)}`);
  const path = resolve(options.root, configured);
  const inside = relative(options.root, path);
  const file = inside === '' || inside.startsWith('..') || isAbsolute(inside) ? path : inside;

  const now = nowIso();
  const target = body.target as ReplaceRequest['target'];
  const quote = typeof target?.quote === 'string' ? target.quote : '';
  const comment = `Replaced "${quote}" with "${body.replacement}"`;
  const annotation: Annotation = {
    id: newId(),
    protocolVersion: PROTOCOL_VERSION,
    route: body.route,
    url: typeof body.url === 'string' ? body.url : body.route,
    mode: 'text',
    target,
    kind: 'replace',
    replacement: { text: body.replacement, file },
    comment,
    status: 'approved',
    thread: [makeMessage({ role: 'user', kind: 'comment', text: comment }, now)],
    batch: null,
    number: 0,
    viewport: body.viewport as Annotation['viewport'],
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    resolvedAt: null,
    approvedAt: now,
    resolution: null,
  };
  const problems = validateAnnotation(annotation);
  if (problems.length > 0) throw badRequest('invalid replacement', problems);
  if (annotation.target.kind !== 'text') throw badRequest('target: expected a text target');
  if (body.replacement === quote) throw badRequest('replacement: the same as the selected text');

  const textTarget = annotation.target;
  await serialized(path, async () => {
    const source = await readFile(path, 'utf8').catch(() => {
      throw notFound(`${file} is missing`);
    });
    const result = applyReplacement(source, textTarget, body.replacement as string);
    if (!result.ok) throw conflict(REFUSALS[result.reason](file));
    await writeFileAtomic(path, result.text);
  });
  return store.recordReplacement(annotation);
}
