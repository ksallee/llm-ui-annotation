import { DEFAULT_BASE_PATH, PROTOCOL_VERSION, slug, type Event, type TransitionRequest } from '@llm-ui-annotation/core';
import { readEvents, readRoute, writeServerInfo } from '@llm-ui-annotation/core/node';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { listRoutes } from '@llm-ui-annotation/core/node';
import { CliError } from '../src/errors.js';
import { FileStore } from '../src/store.js';

/**
 * The subset of the spec 01 wire API `annot` uses, backed by the same files.
 * TODO(ws-05): replace with the real plugin in the live test below.
 */
export interface Stub {
  base: string;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(text);
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startStub(dir: string): Promise<Stub> {
  const store = new FileStore(dir);
  const clients = new Set<ServerResponse>();
  let pushed = 0;

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      send(res, err instanceof CliError && err.code === 2 ? 409 : 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname.slice(DEFAULT_BASE_PATH.length);

    if (path === '/health') return send(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, dir });
    if (path === '/routes') {
      const files = await listRoutes(dir);
      return send(res, 200, { routes: files.map((f) => f.route) });
    }
    if (path.startsWith('/routes/')) {
      const wanted = path.slice('/routes/'.length);
      const files = await listRoutes(dir);
      const file = files.find((f) => slug(f.route) === wanted);
      return file ? send(res, 200, file) : send(res, 404, { error: 'no such route' });
    }
    if (path === '/events') {
      const since = Number(url.searchParams.get('since') ?? 0);
      return send(res, 200, { events: await readEvents(dir, since) });
    }
    if (path === '/events/stream') {
      pushed = Number(url.searchParams.get('since') ?? 0);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const transition = /^\/annotations\/([^/]+)\/transition$/.exec(path);
    if (transition && req.method === 'POST') {
      const id = transition[1] ?? '';
      const request = (await body(req)) as TransitionRequest;
      const a = (await readRoute(dir, '/pricing')).annotations.find((x) => x.id === id);
      if (!a) return send(res, 404, { error: 'no such annotation' });
      const next = await store.transition(a, request.to, request.by, request.message);
      return send(res, 200, next);
    }
    send(res, 404, { error: `no route for ${path}` });
  }

  const timer = setInterval(() => {
    void (async () => {
      if (clients.size === 0) return;
      const events: Event[] = await readEvents(dir, pushed);
      for (const event of events) {
        pushed = Math.max(pushed, event.seq);
        for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    })();
  }, 40);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await writeServerInfo(dir, {
    port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    protocolVersion: PROTOCOL_VERSION,
    basePath: DEFAULT_BASE_PATH,
  });

  return {
    base: `http://127.0.0.1:${port}${DEFAULT_BASE_PATH}`,
    close: async () => {
      clearInterval(timer);
      for (const client of clients) client.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
