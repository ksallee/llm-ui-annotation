import { afterEach, describe, expect, it } from 'vitest';
import type { Annotation, PageTarget } from '@llm-ui-annotation/core';
import { pageAnnotation, PNG, startHarness, type Harness } from './helpers.js';

let harnesses: Harness[] = [];

const serve = async (): Promise<Harness> => {
  const h = await startHarness();
  harnesses.push(h);
  return h;
};

afterEach(async () => {
  const open = harnesses;
  harnesses = [];
  await Promise.all(open.map((h) => h.close()));
});

const ESCAPE = encodeURIComponent('../../../pwned');

describe('path traversal', () => {
  it('refuses a route slug that is not a slug', async () => {
    const h = await serve();
    const res = await h.raw(`/__annot/routes/${ESCAPE}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'slug: expected a route slug' });
  });

  it('refuses a screenshot id that is not an id', async () => {
    const h = await serve();
    const res = await h.raw(`/__annot/screenshots/${ESCAPE}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: PNG,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'id: expected an annotation id' });
  });

  it('refuses a traversing id on every verb that takes one', async () => {
    const h = await serve();
    const cases = [
      ['PATCH', `/__annot/annotations/${ESCAPE}`, { comment: 'x' }],
      ['DELETE', `/__annot/annotations/${ESCAPE}`, null],
      ['POST', `/__annot/annotations/${ESCAPE}/transition`, { to: 'sent', by: 'user' }],
    ] as const;
    for (const [method, path, body] of cases) {
      const res = await h.raw(path, {
        method,
        ...(body === null
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      expect(res.status, `${method} ${path}`).toBe(400);
    }
  });
});

describe('server-owned paths', () => {
  /** A page annotation whose target claims `screenshot`. */
  const claiming = (screenshot: string, over: Partial<Annotation> = {}): Annotation => {
    const a = pageAnnotation(over);
    return { ...a, target: { ...(a.target as PageTarget), screenshot } };
  };

  it('refuses a screenshot path the server never issued', async () => {
    const h = await serve();
    const created = await h.raw('/__annot/annotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(claiming('../../../etc/passwd')),
    });
    expect(created.status).toBe(400);

    const stored = await h.api<Annotation>('/__annot/annotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pageAnnotation()),
    });
    const patched = await h.raw(`/__annot/annotations/${stored.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: claiming('../../../etc/passwd').target }),
    });
    expect(patched.status).toBe(400);
  });
});
