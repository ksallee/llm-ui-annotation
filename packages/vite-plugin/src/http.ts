import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from './errors.js';

export const JSON_LIMIT = 1024 * 1024;
export const PNG_LIMIT = 20 * 1024 * 1024;

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
    if (size > limit) throw new ApiError(413, `body larger than ${limit} bytes`);
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
    throw new ApiError(400, 'body is not valid JSON');
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(body: Buffer): boolean {
  return body.length > PNG_MAGIC.length && body.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}
