import { afterEach, describe, expect, it } from 'vitest';
import { PNG, startHarness, type Harness } from './helpers.js';

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
