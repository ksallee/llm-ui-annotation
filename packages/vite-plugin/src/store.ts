import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  allowedTransitions,
  applyTransition,
  assignBatch,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_TOTAL_MAX_BYTES,
  attachmentExtension,
  attachmentFile,
  canTransition,
  cleanAttachmentName,
  emptyRouteFile,
  makeMessage,
  newId,
  nowIso,
  routeFileFromSlug,
  sniffAttachmentType,
  slug,
  STATUSES,
  validateAnnotation,
  type Actor,
  type Annotation,
  type Attachment,
  type Batch,
  type CreateBatchRequest,
  type Event,
  type MessageKind,
  type NewEvent,
  type NewMessage,
  type Resolution,
  type RouteFile,
  type RouteSummary,
  type Status,
  type Target,
  type TransitionRequest,
} from '@llm-ui-annotation/core';
import {
  appendEvent,
  attachmentPath,
  initDir,
  isEnoent,
  lastEventSeq,
  listRouteSlugs,
  readEvents,
  readTextOrNull,
  removeAttachment,
  removeAttachments,
  removeScreenshot,
  routePath,
  writeAttachment,
  writeBatch,
  writeFileAtomic,
  writeScreenshot,
} from '@llm-ui-annotation/core/node';
import { badRequest, conflict, notFound, tooLarge, unsupportedMedia } from './errors.js';

export type Change =
  | { kind: 'annotation'; annotation: Annotation }
  | { kind: 'deleted'; id: string; route: string }
  | { kind: 'route'; file: RouteFile };

interface CacheEntry {
  file: RouteFile;
  text: string;
  mtimeMs: number;
  size: number;
}

const serialize = (file: RouteFile): string => `${JSON.stringify(file, null, 2)}\n`;

function messageFrom(req: TransitionRequest): NewMessage | undefined {
  const msg = req.message as { kind: MessageKind; text: string; role?: Actor } | undefined;
  if (msg) return { role: msg.role ?? req.by, kind: msg.kind, text: msg.text };
  return resolutionMessage(req.resolution, req.by);
}

function resolutionMessage(resolution: Resolution | undefined, by: Actor): NewMessage | undefined {
  if (!resolution) return undefined;
  return {
    role: by,
    kind: resolution.kind === 'declined' ? 'decline' : 'summary',
    text: resolution.summary,
  };
}

/** Rebuilt from the ids and the type, so a tampered `path` in a route file cannot escape the dir. */
function safeAttachmentPath(annotationId: string, attachment: Attachment): string {
  return attachmentFile(annotationId, attachment.id, attachmentExtension(attachment.type));
}

/** Sole writer of the annotations directory while the dev server runs. */
export class Store {
  readonly dir: string;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly index = new Map<string, string>();
  private readonly listeners = new Set<(event: Event) => void>();
  private readonly changeListeners = new Set<(change: Change) => void>();
  private dispatched = 0;

  constructor(dir: string) {
    this.dir = dir;
  }

  async start(): Promise<void> {
    await initDir(this.dir);
    this.dispatched = await lastEventSeq(this.dir);
    await this.reloadAll();
  }

  subscribe(fn: (event: Event) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onChange(fn: (change: Change) => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  get routeCount(): number {
    return this.cache.size;
  }

  async events(since: number): Promise<Event[]> {
    return readEvents(this.dir, since);
  }

  /** Forward events appended by another writer since the last dispatch. */
  async drainEvents(): Promise<void> {
    for (const event of await readEvents(this.dir, this.dispatched)) this.dispatch(event);
  }

  async routes(): Promise<{ routes: string[]; summaries: RouteSummary[] }> {
    const slugs = await listRouteSlugs(this.dir);
    const summaries: RouteSummary[] = [];
    for (const routeSlug of slugs) {
      const file = await this.loadBySlug(routeSlug);
      if (!file) continue;
      const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
      for (const a of file.annotations) counts[a.status] += 1;
      summaries.push({ route: file.route, slug: routeSlug, counts });
    }
    return { routes: summaries.map((s) => s.route), summaries };
  }

  async routeFile(route: string): Promise<RouteFile> {
    return (await this.loadBySlug(slug(route))) ?? emptyRouteFile(route, nowIso());
  }

  async routeFileBySlug(routeSlug: string, route = ''): Promise<RouteFile> {
    return (await this.loadBySlug(routeSlug)) ?? emptyRouteFile(route, nowIso());
  }

  /** Re-read a route file, pushing an `annot:route` change when another writer touched it. */
  async refreshSlug(routeSlug: string): Promise<void> {
    await this.loadBySlug(routeSlug, true);
  }

  async upsertAnnotation(input: unknown): Promise<{ annotation: Annotation; created: boolean }> {
    const problems = validateAnnotation(input);
    if (problems.length > 0) throw badRequest('invalid annotation', problems);
    const incoming = input as Annotation;
    if (incoming.status !== 'draft' && incoming.status !== 'sent') {
      throw badRequest(`status: expected draft or sent on create, got ${incoming.status}`);
    }

    return this.withRoute(incoming.route, async () => {
      const file = await this.mutableRoute(incoming.route);
      const now = nowIso();
      const at = file.annotations.findIndex((a) => a.id === incoming.id);

      if (at >= 0) {
        const previous = file.annotations[at] as Annotation;
        // Attachments are server-owned: a re-posted draft carries a stale list, or none at all.
        const next: Annotation = {
          ...incoming,
          number: previous.number,
          createdAt: previous.createdAt,
          updatedAt: now,
        };
        delete next.attachments;
        if (previous.attachments) next.attachments = previous.attachments;
        file.annotations[at] = next;
        await this.save(file);
        await this.emit({
          at: now,
          type: 'annotation.updated',
          by: 'user',
          route: file.route,
          annotationId: next.id,
        });
        this.change({ kind: 'annotation', annotation: next });
        return { annotation: next, created: false };
      }

      // The client's number is a hint. Two tabs on one route hydrate the same `nextNumber` and
      // would both claim it, leaving `annot ack #5` permanently ambiguous.
      const wanted = Number.isInteger(incoming.number) && incoming.number > 0 ? incoming.number : file.nextNumber;
      const taken = file.annotations.some((a) => a.number === wanted);
      const free = Math.max(file.nextNumber, ...file.annotations.map((a) => a.number + 1));
      const number = taken ? free : wanted;
      const next: Annotation = {
        ...incoming,
        number,
        updatedAt: now,
        sentAt: incoming.status === 'sent' ? (incoming.sentAt ?? now) : incoming.sentAt,
      };
      delete next.attachments;
      file.nextNumber = Math.max(file.nextNumber, number + 1);
      file.annotations.push(next);
      await this.save(file);
      await this.emit({
        at: now,
        type: 'annotation.created',
        by: 'user',
        route: file.route,
        annotationId: next.id,
        data: next,
      });
      this.change({ kind: 'annotation', annotation: next });
      return { annotation: next, created: true };
    });
  }

  async patchAnnotation(id: string, patch: { comment?: string; target?: Target }): Promise<Annotation> {
    const route = await this.routeOf(id);
    return this.withRoute(route, async () => {
      const file = await this.mutableRoute(route);
      const at = this.locate(file, id);
      const previous = file.annotations[at] as Annotation;
      const now = nowIso();
      const edited = patch.target !== undefined;
      const text = patch.comment ?? 'drawing edited';
      const message = makeMessage({ role: 'user', kind: 'comment', text }, now);
      // The agent's answer was about the old marks, so a reviewed drawing goes back to the agent.
      const status = edited && previous.status === 'review' ? 'sent' : previous.status;
      const next: Annotation = {
        ...previous,
        ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
        ...(patch.target !== undefined ? { target: patch.target } : {}),
        status,
        sentAt: status === 'sent' && previous.status !== 'sent' ? now : previous.sentAt,
        thread: [...previous.thread, message],
        updatedAt: now,
      };
      const problems = validateAnnotation(next);
      if (problems.length > 0) throw badRequest('invalid annotation', problems);
      file.annotations[at] = next;
      await this.save(file);
      await this.emit({
        at: now,
        type: 'thread.message',
        by: 'user',
        route: file.route,
        annotationId: id,
        message,
      });
      if (status !== previous.status) {
        await this.emit({
          at: now,
          type: 'status.changed',
          by: 'user',
          route: file.route,
          annotationId: id,
          status,
          data: next,
        });
      }
      this.change({ kind: 'annotation', annotation: next });
      return next;
    });
  }

  async deleteAnnotation(id: string): Promise<void> {
    const route = await this.routeOf(id);
    await this.withRoute(route, async () => {
      const file = await this.mutableRoute(route);
      const at = this.locate(file, id);
      const previous = file.annotations[at] as Annotation;
      if (previous.status !== 'draft') {
        throw conflict(`only drafts can be deleted; #${previous.number} is ${previous.status}`);
      }
      file.annotations.splice(at, 1);
      await this.save(file);
      await removeScreenshot(this.dir, id);
      await removeAttachments(this.dir, id);
      this.index.delete(id);
      await this.emit({
        at: nowIso(),
        type: 'annotation.deleted',
        by: 'user',
        route: file.route,
        annotationId: id,
      });
      this.change({ kind: 'deleted', id, route: file.route });
    });
  }

  async createBatch(req: CreateBatchRequest): Promise<Batch> {
    if (typeof req.route !== 'string' || !req.route.startsWith('/')) {
      throw badRequest('route: must be a path starting with /');
    }
    if (!Array.isArray(req.annotationIds) || req.annotationIds.length === 0) {
      throw badRequest('annotationIds: expected a non-empty array');
    }

    return this.withRoute(req.route, async () => {
      const file = await this.mutableRoute(req.route);
      const now = nowIso();
      const batch: Batch = {
        id: newId(),
        route: file.route,
        annotationIds: [...req.annotationIds],
        summary: req.summary ?? null,
        sentAt: now,
      };

      const moved: Annotation[] = [];
      for (const id of batch.annotationIds) {
        const at = this.locate(file, id);
        const previous = file.annotations[at] as Annotation;
        if (previous.status !== 'draft' && previous.status !== 'sent') {
          throw conflict(`#${previous.number} is ${previous.status}, only draft or sent can be batched`);
        }
        const sent =
          previous.status === 'draft' ? applyTransition(previous, 'sent', 'user', undefined, now) : previous;
        const next = assignBatch(sent, batch.id, now);
        file.annotations[at] = next;
        moved.push(next);
        if (previous.status === 'draft') {
          await this.emit({
            at: now,
            type: 'status.changed',
            by: 'user',
            route: file.route,
            annotationId: id,
            from: 'draft',
            status: 'sent',
          });
        }
      }

      await this.save(file);
      await writeBatch(this.dir, batch);
      await this.emit({
        at: now,
        type: 'batch.sent',
        by: 'user',
        route: file.route,
        batchId: batch.id,
        data: batch,
      });
      this.change({ kind: 'route', file });
      return batch;
    });
  }

  async transition(id: string, req: TransitionRequest): Promise<Annotation> {
    if (!STATUSES.includes(req.to)) throw badRequest(`to: expected one of ${STATUSES.join('|')}`);
    if (req.by !== 'user' && req.by !== 'agent') throw badRequest('by: expected user or agent');

    const route = await this.routeOf(id);
    return this.withRoute(route, async () => {
      const file = await this.mutableRoute(route);
      const at = this.locate(file, id);
      const previous = file.annotations[at] as Annotation;
      if (!canTransition(previous.status, req.to, req.by)) {
        throw conflict(
          `illegal transition ${previous.status} -> ${req.to} by ${req.by}`,
          allowedTransitions(previous.status, req.by),
        );
      }

      const now = nowIso();
      const message = messageFrom(req);
      let next = applyTransition(previous, req.to, req.by, message, now);
      const appended = message ? next.thread[next.thread.length - 1] : undefined;
      const reopened = req.to === 'sent' && (previous.status === 'review' || previous.status === 'approved');
      let batch: Batch | null = null;
      if (reopened) {
        batch = {
          id: newId(),
          route: file.route,
          annotationIds: [id],
          summary: message?.text ?? null,
          sentAt: now,
        };
        next = assignBatch(next, batch.id, now);
      }

      file.annotations[at] = next;
      await this.save(file);
      if (batch) await writeBatch(this.dir, batch);

      await this.emit({
        at: now,
        type: 'status.changed',
        by: req.by,
        route: file.route,
        annotationId: id,
        from: previous.status,
        status: next.status,
        ...(appended ? { message: appended } : {}),
      });
      if (batch) {
        await this.emit({
          at: now,
          type: 'batch.sent',
          by: req.by,
          route: file.route,
          batchId: batch.id,
          data: batch,
        });
      }
      this.change({ kind: 'annotation', annotation: next });
      return next;
    });
  }

  /** Store a page-mode screenshot and attach its path to the annotation when it exists. */
  async saveScreenshot(id: string, png: Uint8Array): Promise<string> {
    const path = await writeScreenshot(this.dir, id, png);
    const route = await this.routeOf(id).catch(() => null);
    if (route === null) return path;

    await this.withRoute(route, async () => {
      const file = await this.mutableRoute(route);
      const at = file.annotations.findIndex((a) => a.id === id);
      const previous = at >= 0 ? file.annotations[at] : undefined;
      if (!previous || previous.target.kind !== 'page' || previous.target.screenshot === path) return;
      const next: Annotation = {
        ...previous,
        target: { ...previous.target, screenshot: path },
        updatedAt: nowIso(),
      };
      file.annotations[at] = next;
      await this.save(file);
      this.change({ kind: 'annotation', annotation: next });
    });
    return path;
  }

  /** Store a dropped file under `attachments/<id>/` and record it on the annotation. */
  async addAttachment(
    id: string,
    bytes: Buffer,
    rawName: string,
    by: Actor = 'user',
  ): Promise<{ annotation: Annotation; attachment: Attachment }> {
    if (bytes.length === 0) throw badRequest('body: expected the file bytes');
    if (bytes.length > ATTACHMENT_MAX_BYTES) {
      throw tooLarge(`file larger than ${ATTACHMENT_MAX_BYTES} bytes`);
    }
    const name = cleanAttachmentName(rawName);
    const type = sniffAttachmentType(bytes, name);
    if (type === null) {
      throw unsupportedMedia('unsupported file type', [
        `accepted: ${ACCEPTED_ATTACHMENT_TYPES.join(', ')}`,
      ]);
    }

    const route = await this.routeOf(id);
    return this.withRoute(route, async () => {
      const file = await this.mutableRoute(route);
      const at = this.locate(file, id);
      const previous = file.annotations[at] as Annotation;
      const existing = previous.attachments ?? [];
      if (existing.length >= ATTACHMENT_MAX_COUNT) {
        throw conflict(`#${previous.number} already has ${ATTACHMENT_MAX_COUNT} attachments`);
      }
      const total = existing.reduce((n, a) => n + a.bytes, 0);
      if (total + bytes.length > ATTACHMENT_TOTAL_MAX_BYTES) {
        throw tooLarge(`#${previous.number} would exceed ${ATTACHMENT_TOTAL_MAX_BYTES} bytes of attachments`);
      }

      const now = nowIso();
      const attachmentId = newId();
      const path = await writeAttachment(
        this.dir,
        id,
        attachmentId,
        attachmentExtension(type),
        bytes,
      );
      const attachment: Attachment = { id: attachmentId, name, type, bytes: bytes.length, path, at: now, by };
      const next: Annotation = {
        ...previous,
        attachments: [...existing, attachment],
        updatedAt: now,
      };
      file.annotations[at] = next;
      await this.save(file);
      await this.emit({
        at: now,
        type: 'annotation.updated',
        by,
        route: file.route,
        annotationId: id,
      });
      this.change({ kind: 'annotation', annotation: next });
      return { annotation: next, attachment };
    });
  }

  async removeAttachment(id: string, attachmentId: string, by: Actor = 'user'): Promise<Annotation> {
    const route = await this.routeOf(id);
    return this.withRoute(route, async () => {
      const file = await this.mutableRoute(route);
      const at = this.locate(file, id);
      const previous = file.annotations[at] as Annotation;
      const found = (previous.attachments ?? []).find((a) => a.id === attachmentId);
      if (!found) throw notFound(`attachment ${attachmentId} not found on #${previous.number}`);

      const now = nowIso();
      const next: Annotation = {
        ...previous,
        attachments: (previous.attachments ?? []).filter((a) => a.id !== attachmentId),
        updatedAt: now,
      };
      file.annotations[at] = next;
      await this.save(file);
      await removeAttachment(this.dir, safeAttachmentPath(id, found));
      await this.emit({
        at: now,
        type: 'annotation.updated',
        by,
        route: file.route,
        annotationId: id,
      });
      this.change({ kind: 'annotation', annotation: next });
      return next;
    });
  }

  /** The stored file for one attachment, located from the record rather than from the URL. */
  async attachment(
    id: string,
    attachmentId: string,
  ): Promise<{ attachment: Attachment; file: string }> {
    const annotation = await this.annotation(id);
    const attachment = (annotation.attachments ?? []).find((a) => a.id === attachmentId);
    if (!attachment) throw notFound(`attachment ${attachmentId} not found on ${id}`);
    return { attachment, file: attachmentPath(this.dir, safeAttachmentPath(id, attachment)) };
  }

  async annotation(id: string): Promise<Annotation> {
    const route = await this.routeOf(id);
    const file = await this.routeFile(route);
    const found = file.annotations.find((a) => a.id === id);
    if (!found) throw notFound(`annotation ${id} not found`);
    return found;
  }

  private locate(file: RouteFile, id: string): number {
    const at = file.annotations.findIndex((a) => a.id === id);
    if (at < 0) throw notFound(`annotation ${id} not found on ${file.route}`);
    return at;
  }

  /** Route holding `id`, rescanning the directory when the index misses. */
  private async routeOf(id: string): Promise<string> {
    const known = this.index.get(id);
    if (known !== undefined) {
      const file = await this.loadBySlug(slug(known));
      if (file?.annotations.some((a) => a.id === id)) return known;
      this.index.delete(id);
    }
    await this.reloadAll();
    const route = this.index.get(id);
    if (route === undefined) throw notFound(`annotation ${id} not found`);
    return route;
  }

  private async reloadAll(): Promise<void> {
    for (const routeSlug of await listRouteSlugs(this.dir)) await this.loadBySlug(routeSlug);
  }

  private async loadBySlug(routeSlug: string, force = false): Promise<RouteFile | null> {
    const file = join(this.dir, routeFileFromSlug(routeSlug));
    let st;
    try {
      st = await stat(file);
    } catch (err) {
      if (!isEnoent(err)) throw err;
      this.cache.delete(routeSlug);
      return null;
    }
    const entry = this.cache.get(routeSlug);
    if (!force && entry && entry.mtimeMs === st.mtimeMs && entry.size === st.size) return entry.file;

    const text = await readTextOrNull(file);
    if (text === null) {
      this.cache.delete(routeSlug);
      return null;
    }
    if (entry && entry.text === text) {
      this.cache.set(routeSlug, { ...entry, mtimeMs: st.mtimeMs, size: st.size });
      return entry.file;
    }
    let parsed: RouteFile;
    try {
      parsed = JSON.parse(text) as RouteFile;
    } catch {
      return entry?.file ?? null;
    }
    this.cache.set(routeSlug, { file: parsed, text, mtimeMs: st.mtimeMs, size: st.size });
    this.reindex(parsed);
    if (entry) this.change({ kind: 'route', file: parsed });
    return parsed;
  }

  /** A copy safe to mutate inside a route lock. */
  private async mutableRoute(route: string): Promise<RouteFile> {
    const file = await this.routeFile(route);
    return { ...file, annotations: [...file.annotations] };
  }

  private async save(file: RouteFile): Promise<void> {
    file.updatedAt = nowIso();
    const path = routePath(this.dir, file.route);
    const text = serialize(file);
    await writeFileAtomic(path, text);
    const st = await stat(path).catch(() => null);
    this.cache.set(slug(file.route), {
      file,
      text,
      mtimeMs: st?.mtimeMs ?? 0,
      size: st?.size ?? text.length,
    });
    this.reindex(file);
  }

  private reindex(file: RouteFile): void {
    for (const a of file.annotations) this.index.set(a.id, file.route);
  }

  private async emit(event: NewEvent): Promise<Event> {
    const full = await appendEvent(this.dir, event);
    this.dispatch(full);
    return full;
  }

  private dispatch(event: Event): void {
    if (event.seq <= this.dispatched) return;
    this.dispatched = event.seq;
    for (const listener of this.listeners) listener(event);
  }

  private change(change: Change): void {
    for (const listener of this.changeListeners) listener(change);
  }

  private withRoute<T>(route: string, fn: () => Promise<T>): Promise<T> {
    const key = slug(route);
    const run = (this.chains.get(key) ?? Promise.resolve()).then(fn, fn);
    this.chains.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }
}
