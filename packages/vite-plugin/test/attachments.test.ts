import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  newId,
  type Annotation,
  type Attachment,
  type Event,
} from '@llm-ui-annotation/core';
import { afterEach, describe, expect, it } from 'vitest';
import { makeAnnotation, PNG, startHarness, type Harness } from './helpers.js';

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

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< >>\nendobj\n');

async function draft(h: Harness, over: Partial<Annotation> = {}): Promise<Annotation> {
  return h.api<Annotation>('/__annot/annotations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(makeAnnotation(over)),
  });
}

function attach(
  h: Harness,
  id: string,
  body: Buffer,
  name: string,
  init: RequestInit = {},
): Promise<Response> {
  return h.raw(`/__annot/annotations/${id}/attachments?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: body as unknown as BodyInit,
    ...init,
  });
}

async function attached(h: Harness, id: string, body: Buffer, name: string): Promise<Attachment> {
  const res = await attach(h, id, body, name);
  if (res.status !== 201) throw new Error(`attach failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Attachment;
}

describe('attachments', () => {
  it('stores a PNG under attachments/<annotationId>/ and returns the record', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PNG, 'mock-v2.png');

    expect(attachment).toMatchObject({
      name: 'mock-v2.png',
      type: 'image/png',
      bytes: PNG.length,
      path: `attachments/${a.id}/${attachment.id}.png`,
      by: 'user',
    });
    expect(await readFile(join(h.dir, attachment.path))).toEqual(PNG);

    const stored = await h.api<Annotation>(`/__annot/routes/__pricing`).then((f) =>
      (f as unknown as { annotations: Annotation[] }).annotations.find((x) => x.id === a.id),
    );
    expect(stored?.attachments).toEqual([attachment]);
  });

  it('serves the file back, inert', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PDF, 'brand-spec.pdf');

    const res = await h.raw(`/__annot/attachments/${a.id}/${attachment.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PDF);
  });

  it('emits annotation.updated on attach and on delete', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PNG, 'mock.png');
    const del = await h.raw(`/__annot/annotations/${a.id}/attachments/${attachment.id}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);
    await expect(stat(join(h.dir, attachment.path))).rejects.toThrow();

    const { events } = await h.api<{ events: Event[] }>('/__annot/events');
    const updates = events.filter((e) => e.type === 'annotation.updated' && e.annotationId === a.id);
    expect(updates).toHaveLength(2);
  });

  it('deleting a draft removes its attachment directory', async () => {
    const h = await serve();
    const a = await draft(h);
    await attached(h, a.id, PNG, 'mock.png');
    await h.raw(`/__annot/annotations/${a.id}`, { method: 'DELETE' });
    await expect(stat(join(h.dir, 'attachments', a.id))).rejects.toThrow();
  });

  it('sniffs the type instead of believing the client', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PNG, 'not-really.pdf');
    expect(attachment.type).toBe('image/png');
    expect(attachment.path.endsWith('.png')).toBe(true);
  });

  it('rejects a type outside the list, naming the list', async () => {
    const h = await serve();
    const a = await draft(h);
    const res = await attach(h, a.id, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'app.zip');
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: string; problems: string[] };
    expect(body.error).toBe('unsupported file type');
    expect(body.problems[0]).toBe(`accepted: ${ACCEPTED_ATTACHMENT_TYPES.join(', ')}`);
  });

  it('refuses an empty body', async () => {
    const h = await serve();
    const a = await draft(h);
    expect((await attach(h, a.id, Buffer.alloc(0), 'empty.png')).status).toBe(400);
  });

  it('refuses a file over 20 MB', async () => {
    const h = await serve();
    const a = await draft(h);
    const big = Buffer.concat([PNG, Buffer.alloc(21 * 1024 * 1024)]);
    expect((await attach(h, a.id, big, 'huge.png')).status).toBe(413);
    expect(await h.api<{ annotations: Annotation[] }>('/__annot/routes/__pricing')).toMatchObject({
      annotations: [{ id: a.id }],
    });
  });

  it('refuses the eleventh file', async () => {
    const h = await serve();
    const a = await draft(h);
    for (let i = 0; i < 10; i++) await attached(h, a.id, PNG, `mock-${i}.png`);
    const res = await attach(h, a.id, PNG, 'one-too-many.png');
    expect(res.status).toBe(409);
  });

  it('404s an unknown annotation or attachment', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PNG, 'mock.png');
    expect((await h.raw(`/__annot/attachments/${a.id}/${'A'.repeat(26)}`)).status).toBe(404);
    expect((await h.raw(`/__annot/attachments/${'A'.repeat(26)}/${attachment.id}`)).status).toBe(404);
  });
});

const ESCAPE = encodeURIComponent('../../../pwned');

describe('attachments are server-owned', () => {
  it('survives a re-post of the annotation that does not carry them', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PNG, 'mock.png');
    const reposted = await draft(h, { id: a.id, comment: 'edited while attached' });
    expect(reposted.attachments).toEqual([attachment]);
  });

  it('ignores a list the client invents', async () => {
    const h = await serve();
    const a = await draft(h);
    const invented = await draft(h, {
      id: a.id,
      attachments: [
        {
          id: 'A'.repeat(26),
          name: 'ghost.png',
          type: 'image/png',
          bytes: 1,
          path: `attachments/${a.id}/${'A'.repeat(26)}.png`,
          at: '2026-09-05T18:24:41.048Z',
          by: 'user',
        },
      ],
    });
    expect(invented.attachments).toBeUndefined();
  });
});

describe('attachment endpoint hardening', () => {
  it('refuses a traversing annotation id or attachment id', async () => {
    const h = await serve();
    const a = await draft(h);
    const cases: [string, string][] = [
      ['POST', `/__annot/annotations/${ESCAPE}/attachments`],
      ['DELETE', `/__annot/annotations/${a.id}/attachments/${ESCAPE}`],
      ['DELETE', `/__annot/annotations/${ESCAPE}/attachments/${'A'.repeat(26)}`],
      ['GET', `/__annot/attachments/${a.id}/${ESCAPE}`],
      ['GET', `/__annot/attachments/${ESCAPE}/${'A'.repeat(26)}`],
    ];
    for (const [method, path] of cases) {
      const res = await h.raw(path, {
        method,
        ...(method === 'POST'
          ? { headers: { 'content-type': 'application/octet-stream' }, body: PNG as unknown as BodyInit }
          : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(400);
    }
  });

  it('refuses the CORS-simple content types on every write', async () => {
    const h = await serve();
    const a = await draft(h);
    for (const type of ['text/plain', 'multipart/form-data', 'application/x-www-form-urlencoded']) {
      const res = await attach(h, a.id, PNG, 'mock.png', { headers: { 'content-type': type } });
      expect(res.status, type).toBe(415);
      const shot = await h.raw(`/__annot/screenshots/${a.id}`, {
        method: 'POST',
        headers: { 'content-type': type },
        body: PNG as unknown as BodyInit,
      });
      expect(shot.status, `screenshot ${type}`).toBe(415);
    }
  });

  it('refuses a request from another origin', async () => {
    const h = await serve();
    const a = await draft(h);
    const res = await attach(h, a.id, PNG, 'mock.png', {
      headers: { 'content-type': 'application/octet-stream', origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);

    const sec = await attach(h, a.id, PNG, 'mock.png', {
      headers: { 'content-type': 'application/octet-stream', 'sec-fetch-site': 'cross-site' },
    });
    expect(sec.status).toBe(403);
  });

  it('takes the filename from the query and keeps only its basename', async () => {
    const h = await serve();
    const a = await draft(h);
    const attachment = await attached(h, a.id, PNG, '../../../etc/passwd.png');
    expect(attachment.name).toBe('passwd.png');
    expect(attachment.path).toBe(`attachments/${a.id}/${attachment.id}.png`);
  });
});

describe('screenshot serving', () => {
  it('serves a stored screenshot inert, and refuses a traversing id', async () => {
    const h = await serve();
    const id = newId();
    const stored = await h.raw(`/__annot/screenshots/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', origin: h.url },
      body: PNG,
    });
    expect(stored.status).toBe(201);

    const got = await h.raw(`/__annot/screenshots/${id}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(PNG));

    const escape = await h.raw(`/__annot/screenshots/${encodeURIComponent('../../pwned')}`);
    expect(escape.status).toBe(400);

    const missing = await h.raw(`/__annot/screenshots/${newId()}`);
    expect(missing.status).toBe(404);
  });
});
