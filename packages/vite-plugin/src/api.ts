import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { screenshotPath } from '@llm-ui-annotation/core/node';
import {
  ATTACHMENT_MAX_BYTES,
  cleanAttachmentName,
  isId,
  isSlug,
  PROTOCOL_VERSION,
  type Attachment,
  type CreateBatchRequest,
  type Event,
  type PatchAnnotationRequest,
  type TransitionRequest,
} from '@llm-ui-annotation/core';
import { ApiError, badRequest, notFound } from './errors.js';
import {
  assertSameOrigin,
  isPng,
  PNG_LIMIT,
  readBody,
  readJson,
  sendError,
  sendJson,
} from './http.js';
import type { ResolvedOptions } from './options.js';
import type { Store } from './store.js';

const HEARTBEAT_MS = 15_000;

export interface ApiLogger {
  info(message: string): void;
  error(message: string): void;
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  url: URL,
) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

function parsePattern(pattern: string): string[] {
  return pattern.split('/').filter((s) => s !== '');
}

function match(route: Route, method: string, segments: string[]): Record<string, string> | null {
  if (route.method !== method || route.segments.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const expected = route.segments[i] as string;
    const actual = segments[i] as string;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

/** A path param that is about to become a filename. Anything else is a traversal attempt. */
function safeId(params: Record<string, string>): string {
  const id = params['id'] as string;
  if (!isId(id)) throw badRequest('id: expected an annotation id');
  return id;
}

function safeAttachmentId(params: Record<string, string>): string {
  const id = params['attachmentId'] as string;
  if (!isId(id)) throw badRequest('attachmentId: expected an attachment id');
  return id;
}

function safeSlug(params: Record<string, string>): string {
  const value = params['slug'] as string;
  if (!isSlug(value)) throw badRequest('slug: expected a route slug');
  return value;
}

function since(url: URL): number {
  const raw = url.searchParams.get('since');
  const value = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Connect middleware serving the wire API under `options.basePath`. */
export function createApi(
  store: Store,
  options: ResolvedOptions,
  ready: () => Promise<void>,
  logger: ApiLogger,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void {
  const routes: Route[] = [];
  const on = (method: string, pattern: string, handler: Handler): void => {
    routes.push({ method, segments: parsePattern(pattern), handler });
  };

  on('GET', '/health', (_req, res) => {
    sendJson(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, dir: store.dir });
  });

  on('GET', '/routes', async (_req, res) => {
    sendJson(res, 200, await store.routes());
  });

  on('GET', '/routes/:slug', async (_req, res, params, url) => {
    sendJson(res, 200, await store.routeFileBySlug(safeSlug(params), url.searchParams.get('route') ?? ''));
  });

  on('POST', '/annotations', async (req, res) => {
    const body = await readJson(req);
    const withRoute =
      typeof body === 'object' && body !== null && typeof (body as { route?: unknown }).route !== 'string'
        ? { ...(body as Record<string, unknown>), route: options.routeKey(String((body as { url?: unknown }).url ?? '/')) }
        : body;
    const { annotation, created } = await store.upsertAnnotation(withRoute);
    sendJson(res, created ? 201 : 200, annotation);
  });

  on('PATCH', '/annotations/:id', async (req, res, params) => {
    const body = (await readJson(req)) as PatchAnnotationRequest;
    if (typeof body.comment !== 'string') throw badRequest('comment: expected string');
    sendJson(res, 200, await store.patchAnnotation(safeId(params), body.comment));
  });

  on('DELETE', '/annotations/:id', async (_req, res, params) => {
    await store.deleteAnnotation(safeId(params));
    sendJson(res, 200, { ok: true });
  });

  on('POST', '/annotations/:id/transition', async (req, res, params) => {
    const body = (await readJson(req)) as TransitionRequest;
    sendJson(res, 200, await store.transition(safeId(params), body));
  });

  on('POST', '/batches', async (req, res) => {
    const body = (await readJson(req)) as CreateBatchRequest;
    const batch = await store.createBatch(body);
    logger.info(
      `[annot] batch ${batch.id} sent, ${batch.annotationIds.length} item${batch.annotationIds.length === 1 ? '' : 's'} on ${batch.route}`,
    );
    sendJson(res, 201, batch);
  });

  on('GET', '/events', async (_req, res, _params, url) => {
    sendJson(res, 200, { events: await store.events(since(url)) });
  });

  on('GET', '/events/stream', async (req, res, _params, url) => {
    await streamEvents(store, req, res, since(url));
  });

  on('POST', '/screenshots/:id', async (req, res, params) => {
    assertSameOrigin(req);
    const body = await readBody(req, PNG_LIMIT);
    if (!isPng(body)) throw badRequest('body: expected a PNG image');
    sendJson(res, 201, { path: await store.saveScreenshot(safeId(params), body) });
  });

  on('POST', '/annotations/:id/attachments', async (req, res, params, url) => {
    assertSameOrigin(req);
    const id = safeId(params);
    const name = cleanAttachmentName(url.searchParams.get('name') ?? '');
    const by = url.searchParams.get('by') === 'agent' ? 'agent' : 'user';
    const body = await readBody(req, ATTACHMENT_MAX_BYTES);
    const { attachment } = await store.addAttachment(id, body, name, by);
    sendJson(res, 201, attachment);
  });

  on('DELETE', '/annotations/:id/attachments/:attachmentId', async (req, res, params) => {
    assertSameOrigin(req);
    await store.removeAttachment(safeId(params), safeAttachmentId(params));
    sendJson(res, 200, { ok: true });
  });

  on('GET', '/attachments/:id/:attachmentId', async (_req, res, params) => {
    const { attachment, file } = await store.attachment(safeId(params), safeAttachmentId(params));
    await sendAttachment(res, attachment, file);
  });

  on('GET', '/screenshots/:id', async (_req, res, params) => {
    const id = safeId(params);
    await sendFileInert(res, screenshotPath(options.dir, id), 'image/png', `${id}.png`);
  });

  const prefix = options.basePath;

  return (req, res, next) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (path !== prefix && !path.startsWith(`${prefix}/`)) {
      next();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const segments = url.pathname.slice(prefix.length).split('/').filter((s) => s !== '');
    const method = (req.method ?? 'GET').toUpperCase();

    for (const route of routes) {
      const params = match(route, method, segments);
      if (!params) continue;
      void ready()
        .then(() => route.handler(req, res, params, url))
        .catch((err: unknown) => {
          if (!(err instanceof ApiError) || err.status >= 500) {
            logger.error(`[annot] ${method} ${url.pathname}: ${err instanceof Error ? err.message : String(err)}`);
          }
          if (!res.headersSent) sendError(res, err);
          else res.end();
        });
      return;
    }

    sendError(res, notFound(`no route for ${method} ${url.pathname}`));
  };
}

/** Replay events after `cursor`, then stream new ones until the client disconnects. */
async function streamEvents(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse,
  cursor: number,
): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': open\n\n');

  let last = cursor;
  let replaying = true;
  const pending: Event[] = [];

  const write = (event: Event): void => {
    if (event.seq <= last) return;
    last = event.seq;
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const unsubscribe = store.subscribe((event) => {
    if (replaying) pending.push(event);
    else write(event);
  });

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  heartbeat.unref();

  const close = (): void => {
    unsubscribe();
    clearInterval(heartbeat);
  };
  req.on('close', close);
  res.on('close', close);

  try {
    for (const event of await store.events(cursor)) write(event);
  } finally {
    replaying = false;
    for (const event of pending) write(event);
  }
}

async function sendAttachment(res: ServerResponse, attachment: Attachment, file: string): Promise<void> {
  await sendFileInert(res, file, attachment.type, attachment.name);
}

/** Served inert: sniffing off, scripts off, so an SVG cannot run on the dev origin. */
async function sendFileInert(
  res: ServerResponse,
  file: string,
  type: string,
  name: string,
): Promise<void> {
  const info = await stat(file).catch(() => null);
  if (info === null) throw notFound(`${name} is missing from disk`);
  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'cache-control': 'no-store',
  });
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}
