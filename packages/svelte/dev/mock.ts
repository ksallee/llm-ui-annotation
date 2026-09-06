import {
  ACCEPTED_ATTACHMENT_TYPES,
  applyTransition,
  attachmentExtension,
  attachmentFile,
  newId,
  nowIso,
  sniffAttachmentType,
  slug,
  type Annotation,
  type Attachment,
  type Batch,
  type Event,
  type RouteFile,
} from '@llm-ui-annotation/core';
import type { Connect, Plugin } from 'vite';

interface Store {
  routes: Map<string, RouteFile>;
  batches: Batch[];
  events: Event[];
}

const store: Store = { routes: new Map(), batches: [], events: [] };

const routeFile = (route: string): RouteFile => {
  const existing = store.routes.get(route);
  if (existing) return existing;
  const created: RouteFile = { route, updatedAt: nowIso(), nextNumber: 1, annotations: [] };
  store.routes.set(route, created);
  return created;
};

function emit(event: Omit<Event, 'seq' | 'at'>): void {
  store.events.push({ ...event, seq: store.events.length + 1, at: nowIso() });
}

function put(annotation: Annotation): void {
  const file = routeFile(annotation.route);
  const index = file.annotations.findIndex((a) => a.id === annotation.id);
  if (index >= 0) file.annotations[index] = annotation;
  else file.annotations.push(annotation);
  file.updatedAt = nowIso();
}

const find = (id: string): Annotation | null => {
  for (const file of store.routes.values()) {
    const found = file.annotations.find((a) => a.id === id);
    if (found) return found;
  }
  return null;
};

const bytes = async (req: Connect.IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

const body = async (req: Connect.IncomingMessage): Promise<string> =>
  (await bytes(req)).toString('utf8');

/** Attachment bytes, by `<annotationId>/<attachmentId>`. */
const files = new Map<string, { type: string; data: Buffer }>();

/** Pretends to be the agent: acks a batch, then answers by the comment prefix. */
function fakeAgent(batch: Batch): void {
  const step = (id: string, delay: number, run: () => void): void => {
    setTimeout(run, delay);
  };
  batch.annotationIds.forEach((id, i) => {
    step(id, 900 + i * 200, () => {
      const a = find(id);
      if (!a || a.status !== 'sent') return;
      const acked = applyTransition(a, 'acknowledged', 'agent');
      put(acked);
      emit({ type: 'status.changed', by: 'agent', route: acked.route, annotationId: id, status: 'acknowledged', data: acked });
    });
    step(id, 2600 + i * 200, () => {
      const a = find(id);
      if (!a || a.status !== 'acknowledged') return;
      const comment = a.comment.toLowerCase();
      const next = comment.startsWith('ask:')
        ? applyTransition(a, 'question', 'agent', { role: 'agent', kind: 'question', text: 'Which one exactly?' })
        : comment.startsWith('decline:')
          ? applyTransition(a, 'review', 'agent', { role: 'agent', kind: 'decline', text: 'Out of scope for now.' })
          : applyTransition(a, 'review', 'agent', {
              role: 'agent',
              kind: 'summary',
              text: 'fake: adjusted the spacing and re-ran the build.',
            });
      put(next);
      emit({ type: 'status.changed', by: 'agent', route: next.route, annotationId: id, status: next.status, data: next });
    });
  });
}

/** In-memory `/__annot` API so the overlay can be driven without the real plugin. */
export function mockAnnot(base = '/__annot'): Plugin {
  return {
    name: 'annot-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith(base)) return next();
        const path = url.pathname.slice(base.length);
        const send = (status: number, payload: unknown): void => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        if (path === '/health') return send(200, { ok: true, protocolVersion: 1, dir: '(mock)' });

        if (path === '/routes') return send(200, { routes: [...store.routes.keys()] });

        if (path.startsWith('/routes/')) {
          const wanted = path.slice('/routes/'.length);
          for (const file of store.routes.values()) if (slug(file.route) === wanted) return send(200, file);
          return send(200, { route: '/', updatedAt: nowIso(), nextNumber: 1, annotations: [] });
        }

        if (path === '/events') {
          const since = Number(url.searchParams.get('since') ?? 0);
          return send(200, { events: store.events.filter((e) => e.seq > since) });
        }

        if (path === '/annotations' && req.method === 'POST') {
          const incoming = JSON.parse(await body(req)) as Annotation;
          const file = routeFile(incoming.route);
          const annotation = { ...incoming, number: incoming.number || file.nextNumber };
          file.nextNumber = Math.max(file.nextNumber, annotation.number + 1);
          put(annotation);
          emit({ type: 'annotation.created', by: 'user', route: annotation.route, annotationId: annotation.id, data: annotation });
          return send(200, annotation);
        }

        if (path === '/batches' && req.method === 'POST') {
          const request = JSON.parse(await body(req)) as { route: string; annotationIds: string[]; summary: string | null };
          const batch: Batch = { id: newId(), route: request.route, annotationIds: request.annotationIds, summary: request.summary, sentAt: nowIso() };
          store.batches.push(batch);
          for (const id of request.annotationIds) {
            const a = find(id);
            if (!a) continue;
            const sent = a.status === 'draft' ? applyTransition(a, 'sent', 'user') : a;
            put({ ...sent, batch: batch.id });
          }
          emit({ type: 'batch.sent', by: 'user', route: batch.route, batchId: batch.id, data: batch });
          fakeAgent(batch);
          return send(200, batch);
        }

        const transition = /^\/annotations\/([^/]+)\/transition$/.exec(path);
        if (transition && req.method === 'POST') {
          const a = find(transition[1]!);
          if (!a) return send(404, { error: 'not found' });
          const request = JSON.parse(await body(req)) as { to: Annotation['status']; by: 'user' | 'agent'; message?: { kind: string; text: string; role: 'user' | 'agent' } };
          const next = applyTransition(
            a,
            request.to,
            request.by,
            request.message ? { role: request.message.role, kind: request.message.kind as 'comment', text: request.message.text } : undefined,
          );
          put(next);
          emit({ type: 'status.changed', by: request.by, route: next.route, annotationId: next.id, status: next.status, data: next });
          return send(200, next);
        }

        const one = /^\/annotations\/([^/]+)$/.exec(path);
        if (one && req.method === 'PATCH') {
          const a = find(one[1]!);
          if (!a) return send(404, { error: 'not found' });
          const request = JSON.parse(await body(req)) as { comment?: string };
          const next = { ...a, comment: request.comment ?? a.comment, updatedAt: nowIso() };
          put(next);
          emit({ type: 'annotation.updated', by: 'user', route: next.route, annotationId: next.id, data: next });
          return send(200, next);
        }
        if (one && req.method === 'DELETE') {
          const id = one[1]!;
          const a = find(id);
          if (a) {
            const file = routeFile(a.route);
            file.annotations = file.annotations.filter((other) => other.id !== id);
            emit({ type: 'annotation.deleted', by: 'user', route: a.route, annotationId: id });
          }
          return send(200, { ok: true });
        }

        const attach = /^\/annotations\/([^/]+)\/attachments$/.exec(path);
        if (attach && req.method === 'POST') {
          const a = find(attach[1]!);
          const data = await bytes(req);
          if (!a) return send(404, { error: 'not found' });
          const name = url.searchParams.get('name') ?? 'file';
          const type = sniffAttachmentType(data, name);
          if (!type) {
            return send(415, {
              error: 'unsupported file type',
              problems: [`accepted: ${ACCEPTED_ATTACHMENT_TYPES.join(', ')}`],
            });
          }
          const attachment: Attachment = {
            id: newId(),
            name,
            type,
            bytes: data.length,
            path: attachmentFile(a.id, newId(), attachmentExtension(type)),
            at: nowIso(),
            by: 'user',
          };
          files.set(`${a.id}/${attachment.id}`, { type, data });
          const next = { ...a, attachments: [...(a.attachments ?? []), attachment], updatedAt: nowIso() };
          put(next);
          emit({ type: 'annotation.updated', by: 'user', route: next.route, annotationId: next.id, data: next });
          return send(201, attachment);
        }

        const detach = /^\/annotations\/([^/]+)\/attachments\/([^/]+)$/.exec(path);
        if (detach && req.method === 'DELETE') {
          const a = find(detach[1]!);
          if (!a) return send(404, { error: 'not found' });
          files.delete(`${a.id}/${detach[2]!}`);
          const next = {
            ...a,
            attachments: (a.attachments ?? []).filter((x) => x.id !== detach[2]),
            updatedAt: nowIso(),
          };
          put(next);
          emit({ type: 'annotation.updated', by: 'user', route: next.route, annotationId: next.id, data: next });
          return send(200, { ok: true });
        }

        const attachment = /^\/attachments\/([^/]+)\/([^/]+)$/.exec(path);
        if (attachment && req.method === 'GET') {
          const stored = files.get(`${attachment[1]}/${attachment[2]}`);
          if (!stored) return send(404, { error: 'not found' });
          res.statusCode = 200;
          res.setHeader('content-type', stored.type);
          res.setHeader('x-content-type-options', 'nosniff');
          res.end(stored.data);
          return;
        }

        const shot = /^\/screenshots\/([^/]+)$/.exec(path);
        if (shot && req.method === 'POST') {
          await body(req);
          return send(200, { path: `screenshots/${shot[1]}.png` });
        }

        return send(404, { error: `no mock route for ${path}` });
      });
    },
  };
}
