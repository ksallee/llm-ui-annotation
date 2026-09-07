/** The append-only `events.jsonl` log. */

import { open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  eventsSince,
  lastSeq,
  parseEvents,
  serializeEvent,
  type Event,
  type NewEvent,
} from '../protocol/events.js';
import { EVENTS_FILE } from '../protocol/paths.js';
import { appendLine, isEnoent, readTextOrNull } from './fs.js';

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

/** The last `bytes` of a file, empty when it does not exist. */
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
  return since > 0 ? eventsSince(events, since) : events;
}
