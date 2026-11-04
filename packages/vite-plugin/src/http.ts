import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, badRequest, forbidden, tooLarge, unsupportedMedia } from './errors.js';

export const JSON_LIMIT = 1024 * 1024;

/** Content types a cross-origin page can send without a preflight. */
const SIMPLE_TYPES = ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'];

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function contentType(req: IncomingMessage): string {
  return (header(req, 'content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Refuse anything a page on another origin could send us. A request carrying a body must not be
 * CORS-simple, so the browser preflights it and — no CORS headers here — never sends it.
 */
export function assertSameOrigin(req: IncomingMessage): void {
  const site = header(req, 'sec-fetch-site');
  if (site !== undefined && site !== 'same-origin' && site !== 'none') {
    throw forbidden(`cross-origin request refused (sec-fetch-site: ${site})`);
  }
  const origin = header(req, 'origin');
  const host = header(req, 'host');
  if (origin !== undefined) {
    // `null` is what a sandboxed iframe, a data: document and a file: page send. It is not ours.
    let originHost: string | null = null;
    try {
      originHost = origin === 'null' ? null : new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== host) throw forbidden(`cross-origin request refused (origin: ${origin})`);
  }
  const type = contentType(req);
  if (SIMPLE_TYPES.includes(type)) {
    throw unsupportedMedia(`content-type ${type} is not accepted on this endpoint`);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof ApiError) {
    sendJson(res, err.status, err.problems ? { error: err.message, problems: err.problems } : { error: err.message });
    return;
  }
  sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw tooLarge(`body larger than ${limit} bytes`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, limit = JSON_LIMIT): Promise<unknown> {
  const body = await readBody(req, limit);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw badRequest('body is not valid JSON');
  }
}
