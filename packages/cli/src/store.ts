import {
  ACCEPTED_ATTACHMENT_TYPES,
  applyTransition,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_TOTAL_MAX_BYTES,
  attachmentExtension,
  cleanAttachmentName,
  makeMessage,
  newId,
  nowIso,
  slug,
  sniffAttachmentType,
  type Actor,
  type Annotation,
  type Attachment,
  type Batch,
  type Event,
  type NewEvent,
  type NewMessage,
  type RouteFile,
  type RouteSummary,
  type Status,
  type TransitionRequest,
} from '@llm-ui-annotation/core';
import {
  appendEvent,
  lastEventSeq,
  writeAttachment,
  readAllAnnotations,
  readBatch,
  readEvents,
  readRoute,
  writeRoute,
} from '@llm-ui-annotation/core/node';
import { CliError, EXIT_FAIL, EXIT_ILLEGAL } from './errors.js';

export const POLL_MS = 150;

export interface Attached {
  annotation: Annotation;
  attachment: Attachment;
}

/** The type and the caps, applied the same way the plugin applies them. */
export function checkAttachment(a: Annotation, bytes: Uint8Array, name: string): string {
  if (bytes.length === 0) throw new CliError(`${name} is empty`);
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    throw new CliError(`${name} is larger than ${ATTACHMENT_MAX_BYTES} bytes`);
  }
  const type = sniffAttachmentType(bytes, name);
  if (type === null) {
    throw new CliError(`${name}: unsupported file type`, EXIT_FAIL, [
      `accepted: ${ACCEPTED_ATTACHMENT_TYPES.join(', ')}`,
    ]);
  }
  const existing = a.attachments ?? [];
  if (existing.length >= ATTACHMENT_MAX_COUNT) {
    throw new CliError(`#${a.number} already has ${ATTACHMENT_MAX_COUNT} attachments`);
  }
  const total = existing.reduce((n, x) => n + x.bytes, 0);
  if (total + bytes.length > ATTACHMENT_TOTAL_MAX_BYTES) {
    throw new CliError(`#${a.number} would exceed ${ATTACHMENT_TOTAL_MAX_BYTES} bytes of attachments`);
  }
  return type;
}

export interface Store {
  readonly kind: 'http' | 'file';
  readonly dir: string;
  annotations(): Promise<Annotation[]>;
  routes(): Promise<RouteSummary[]>;
  batch(id: string): Promise<Batch | null>;
  transition(a: Annotation, to: Status, by: Actor, msg?: NewMessage): Promise<Annotation>;
  appendMessage(a: Annotation, msg: NewMessage): Promise<Annotation>;
  attach(a: Annotation, bytes: Uint8Array, name: string): Promise<Attached>;
  events(since: number): Promise<Event[]>;
  lastSeq(): Promise<number>;
  stream(since: number, signal: AbortSignal): AsyncGenerator<Event>;
}

function countByStatus(annotations: readonly Annotation[]): RouteSummary['counts'] {
  const counts = { draft: 0, sent: 0, acknowledged: 0, question: 0, review: 0, approved: 0 };
  for (const a of annotations) counts[a.status]++;
  return counts;
}

export function summarizeRoutes(annotations: readonly Annotation[]): RouteSummary[] {
  const byRoute = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const list = byRoute.get(a.route);
    if (list) list.push(a);
    else byRoute.set(a.route, [a]);
  }
  return [...byRoute.entries()]
    .map(([route, list]) => ({ route, slug: slug(route), counts: countByStatus(list) }))
    .sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
}

function illegal(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new CliError(message, EXIT_ILLEGAL);
}

export class FileStore implements Store {
  readonly kind = 'file';

  constructor(readonly dir: string) {}

  annotations(): Promise<Annotation[]> {
    return readAllAnnotations(this.dir);
  }

  async routes(): Promise<RouteSummary[]> {
    return summarizeRoutes(await this.annotations());
  }

  batch(id: string): Promise<Batch | null> {
    return readBatch(this.dir, id);
  }

  /** Replace `a` in its route file with `next` and log `event`. */
  private async commit(a: Annotation, next: Annotation, event: NewEvent): Promise<Annotation> {
    const file: RouteFile = await readRoute(this.dir, a.route);
    const index = file.annotations.findIndex((x) => x.id === a.id);
    if (index === -1) throw new CliError(`annotation ${a.id} is not in ${a.route} any more`);
    const annotations = file.annotations.slice();
    annotations[index] = next;
    await writeRoute(this.dir, { ...file, annotations, updatedAt: next.updatedAt });
    await appendEvent(this.dir, event);
    return next;
  }

  async transition(a: Annotation, to: Status, by: Actor, msg?: NewMessage): Promise<Annotation> {
    const now = nowIso();
    let next: Annotation;
    try {
      next = applyTransition(a, to, by, msg, now);
    } catch (err) {
      illegal(err);
    }
    const appended = next.thread[next.thread.length - 1];
    return this.commit(a, next, {
      at: now,
      type: 'status.changed',
      by,
      route: a.route,
      annotationId: a.id,
      status: to,
      from: a.status,
      ...(msg && appended ? { message: appended } : {}),
    });
  }

  async appendMessage(a: Annotation, msg: NewMessage): Promise<Annotation> {
    const now = nowIso();
    const message = makeMessage(msg, now);
    const next: Annotation = { ...a, thread: [...a.thread, message], updatedAt: now };
    return this.commit(a, next, {
      at: now,
      type: 'thread.message',
      by: msg.role,
      route: a.route,
      annotationId: a.id,
      status: a.status,
      message,
    });
  }

  async attach(a: Annotation, bytes: Uint8Array, rawName: string): Promise<Attached> {
    const name = cleanAttachmentName(rawName);
    const type = checkAttachment(a, bytes, name);
    const now = nowIso();
    const id = newId();
    const path = await writeAttachment(this.dir, a.id, id, attachmentExtension(type), bytes);
    const attachment: Attachment = {
      id,
      name,
      type,
      bytes: bytes.length,
      path,
      at: now,
      by: 'agent',
    };
    const next: Annotation = {
      ...a,
      attachments: [...(a.attachments ?? []), attachment],
      updatedAt: now,
    };
    const annotation = await this.commit(a, next, {
      at: now,
      type: 'annotation.updated',
      by: 'agent',
      route: a.route,
      annotationId: a.id,
      status: a.status,
    });
    return { annotation, attachment };
  }

  events(since: number): Promise<Event[]> {
    return readEvents(this.dir, since);
  }

  lastSeq(): Promise<number> {
    return lastEventSeq(this.dir);
  }

  async *stream(since: number, signal: AbortSignal): AsyncGenerator<Event> {
    let cursor = since;
    for (;;) {
      if (signal.aborted) return;
      for (const event of await this.events(cursor)) {
        cursor = Math.max(cursor, event.seq);
        yield event;
      }
      if (signal.aborted) return;
      await sleep(POLL_MS, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

export class HttpStore implements Store {
  readonly kind = 'http';
  private readonly files: FileStore;

  constructor(
    readonly dir: string,
    readonly base: string,
  ) {
    this.files = new FileStore(dir);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, init);
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const error =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `${res.status} ${res.statusText}`;
      const problems =
        body && typeof body === 'object' && Array.isArray((body as { problems?: unknown }).problems)
          ? ((body as { problems: unknown[] }).problems.map(String) as string[])
          : [];
      throw new CliError(error, res.status === 409 ? EXIT_ILLEGAL : 1, problems);
    }
    return (await res.json()) as T;
  }

  async annotations(): Promise<Annotation[]> {
    const { routes } = await this.request<{ routes: string[] }>('/routes');
    const files = await Promise.all(
      routes.map((route) => this.request<RouteFile>(`/routes/${slug(route)}`)),
    );
    return files.flatMap((f) => f.annotations);
  }

  async routes(): Promise<RouteSummary[]> {
    const res = await this.request<{ routes: string[]; summaries?: RouteSummary[] }>('/routes');
    if (res.summaries) return res.summaries;
    return summarizeRoutes(await this.annotations());
  }

  batch(id: string): Promise<Batch | null> {
    return this.files.batch(id);
  }

  async transition(a: Annotation, to: Status, by: Actor, msg?: NewMessage): Promise<Annotation> {
    const body: TransitionRequest = { to, by, ...(msg ? { message: msg } : {}) };
    return this.request<Annotation>(`/annotations/${a.id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** No wire verb appends a message without a transition, so this one writes files. */
  appendMessage(a: Annotation, msg: NewMessage): Promise<Annotation> {
    return this.files.appendMessage(a, msg);
  }

  async attach(a: Annotation, bytes: Uint8Array, rawName: string): Promise<Attached> {
    const name = cleanAttachmentName(rawName);
    checkAttachment(a, bytes, name);
    const attachment = await this.request<Attachment>(
      `/annotations/${a.id}/attachments?name=${encodeURIComponent(name)}&by=agent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Blob([Uint8Array.from(bytes)]),
      },
    );
    return {
      annotation: { ...a, attachments: [...(a.attachments ?? []), attachment] },
      attachment,
    };
  }

  async events(since: number): Promise<Event[]> {
    const { events } = await this.request<{ events: Event[] }>(`/events?since=${since}`);
    return events;
  }

  async lastSeq(): Promise<number> {
    const events = await this.events(0);
    return events.length > 0 ? Math.max(...events.map((e) => e.seq)) : 0;
  }

  async *stream(since: number, signal: AbortSignal): AsyncGenerator<Event> {
    const res = await fetch(`${this.base}/events/stream?since=${since}`, {
      headers: { accept: 'text/event-stream' },
      signal,
    });
    if (!res.ok || !res.body) throw new CliError(`event stream failed: ${res.status}`);
    let buffer = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += new TextDecoder().decode(chunk, { stream: true });
      let cut = buffer.indexOf('\n\n');
      while (cut !== -1) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const event = parseFrame(frame);
        if (event) yield event;
        cut = buffer.indexOf('\n\n');
      }
    }
  }
}

function parseFrame(frame: string): Event | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (data === '') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === 'object' && 'seq' in parsed ? (parsed as Event) : null;
  } catch {
    return null;
  }
}
