import { open, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { nowIso } from '../model/id.js';
import type { Annotation, Batch } from '../model/types.js';
import { lastSeq, parseEvents, serializeEvent, type Event, type NewEvent } from '../protocol/events.js';
import {
  attachmentDir,
  attachmentFile,
} from '../protocol/attachments.js';
import {
  DEFAULT_DIR,
  EVENTS_FILE,
  ROUTES_DIR,
  SERVER_FILE,
  batchFile,
  emptyRouteFile,
  routeFile,
  routeFileFromSlug,
  screenshotFile,
  type RouteFile,
  type ServerInfo,
} from '../protocol/paths.js';
import {
  appendLine,
  ensureDir,
  isEnoent,
  readJsonOrNull,
  readTextOrNull,
  writeFileAtomic,
  writeJson,
} from './fs.js';

export * from './fs.js';

const TAIL_BYTES = 65536;

const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
  locks.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

async function tail(file: string, bytes = TAIL_BYTES): Promise<string> {
  let fh;
  try {
    fh = await open(file, 'r');
  } catch (err) {
    if (isEnoent(err)) return '';
    throw err;
  }
  try {
    const { size } = await fh.stat();
    const length = Math.min(bytes, size);
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, size - length);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
}

export function eventsPath(dir: string): string {
  return join(dir, EVENTS_FILE);
}

export function serverInfoPath(dir: string): string {
  return join(dir, SERVER_FILE);
}

export function screenshotPath(dir: string, id: string): string {
  return join(dir, screenshotFile(id));
}

export function routePath(dir: string, route: string): string {
  return join(dir, routeFile(route));
}

/** Route file for `route`; an empty one when it does not exist yet. */
export async function readRoute(dir: string, route: string): Promise<RouteFile> {
  const file = await readJsonOrNull<RouteFile>(routePath(dir, route));
  return file ?? emptyRouteFile(route, nowIso());
}

export async function readRouteBySlug(dir: string, routeSlug: string): Promise<RouteFile | null> {
  return readJsonOrNull<RouteFile>(join(dir, routeFileFromSlug(routeSlug)));
}

export async function writeRoute(dir: string, file: RouteFile): Promise<void> {
  await writeJson(routePath(dir, file.route), file);
}

/** Slugs of every route file on disk. */
export async function listRouteSlugs(dir: string): Promise<string[]> {
  try {
    const names = await readdir(join(dir, ROUTES_DIR));
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -'.json'.length)).sort();
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
}

export async function listRoutes(dir: string): Promise<RouteFile[]> {
  const slugs = await listRouteSlugs(dir);
  const files = await Promise.all(slugs.map((s) => readRouteBySlug(dir, s)));
  return files.filter((f): f is RouteFile => f !== null);
}

/** Every annotation across every route file. */
export async function readAllAnnotations(dir: string): Promise<Annotation[]> {
  const files = await listRoutes(dir);
  return files.flatMap((f) => f.annotations);
}

export async function readBatch(dir: string, id: string): Promise<Batch | null> {
  return readJsonOrNull<Batch>(join(dir, batchFile(id)));
}

export async function writeBatch(dir: string, batch: Batch): Promise<void> {
  await writeJson(join(dir, batchFile(batch.id)), batch);
}

/** Highest seq written so far, 0 when there is no log. */
export async function lastEventSeq(dir: string): Promise<number> {
  return lastSeq(await tail(eventsPath(dir)));
}

/** Append an event, assigning the next seq. Serialized per dir within this process. */
export async function appendEvent(dir: string, event: NewEvent): Promise<Event> {
  const file = eventsPath(dir);
  return withLock(resolve(file), async () => {
    const seq = lastSeq(await tail(file)) + 1;
    const full: Event = { ...event, seq };
    await appendLine(file, serializeEvent(full));
    return full;
  });
}

export async function readEvents(dir: string, since = 0): Promise<Event[]> {
  const text = await readTextOrNull(eventsPath(dir));
  if (text === null) return [];
  const events = parseEvents(text);
  return since > 0 ? events.filter((e) => e.seq > since) : events;
}

export async function readServerInfo(dir: string): Promise<ServerInfo | null> {
  return readJsonOrNull<ServerInfo>(serverInfoPath(dir));
}

export async function writeServerInfo(dir: string, info: ServerInfo): Promise<void> {
  await writeJson(serverInfoPath(dir), info);
}

export async function removeServerInfo(dir: string): Promise<void> {
  await rm(serverInfoPath(dir), { force: true });
}

/** Write a screenshot and return its path relative to `dir`. */
export async function writeScreenshot(dir: string, id: string, png: Uint8Array): Promise<string> {
  await writeFileAtomic(screenshotPath(dir, id), png);
  return screenshotFile(id);
}

export async function removeScreenshot(dir: string, id: string): Promise<void> {
  await rm(screenshotPath(dir, id), { force: true });
}

export function attachmentDirPath(dir: string, annotationId: string): string {
  return join(dir, attachmentDir(annotationId));
}

export function attachmentPath(dir: string, relative: string): string {
  return join(dir, relative);
}

/** Write an attachment and return its path relative to `dir`. */
export async function writeAttachment(
  dir: string,
  annotationId: string,
  attachmentId: string,
  ext: string,
  bytes: Uint8Array,
): Promise<string> {
  const relative = attachmentFile(annotationId, attachmentId, ext);
  await writeFileAtomic(join(dir, relative), bytes);
  return relative;
}

export async function readAttachment(dir: string, relative: string): Promise<Buffer | null> {
  try {
    return await readFile(join(dir, relative));
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

export async function removeAttachment(dir: string, relative: string): Promise<void> {
  await rm(join(dir, relative), { force: true });
}

/** Drop the whole `attachments/<annotationId>/` directory. */
export async function removeAttachments(dir: string, annotationId: string): Promise<void> {
  await rm(attachmentDirPath(dir, annotationId), { recursive: true, force: true });
}

/** Create the directory skeleton. */
export async function initDir(dir: string): Promise<void> {
  await ensureDir(join(dir, ROUTES_DIR));
}

/** Nearest annotations dir at or above `from`, or null. */
export async function findAnnotationsDir(
  from: string,
  name: string = DEFAULT_DIR,
): Promise<string | null> {
  let current = isAbsolute(from) ? from : resolve(from);
  for (;;) {
    const candidate = join(current, name);
    try {
      await readdir(candidate);
      return candidate;
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
