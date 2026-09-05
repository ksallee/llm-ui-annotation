import type { Actor, Annotation, Batch, Message, Status } from '../model/types.js';

export type EventType =
  | 'annotation.created'
  | 'annotation.updated'
  | 'annotation.deleted'
  | 'batch.sent'
  | 'thread.message'
  | 'status.changed';

export const EVENT_TYPES: readonly EventType[] = [
  'annotation.created',
  'annotation.updated',
  'annotation.deleted',
  'batch.sent',
  'thread.message',
  'status.changed',
];

export interface Event {
  /** Monotonic per events.jsonl, assigned by the writer. */
  seq: number;
  at: string;
  type: EventType;
  by: Actor;
  route: string;
  annotationId?: string;
  batchId?: string;
  status?: Status;
  from?: Status;
  message?: Message;
  /** Full object on created / batch.sent so a consumer can rebuild without reading routes/. */
  data?: Annotation | Batch;
}

export type NewEvent = Omit<Event, 'seq'>;

export function serializeEvent(event: Event): string {
  return `${JSON.stringify(event)}\n`;
}

/** One event per line; malformed lines are dropped. */
export function parseEvents(jsonl: string): Event[] {
  const out: Event[] = [];
  for (const line of jsonl.split('\n')) {
    const e = parseEventLine(line);
    if (e) out.push(e);
  }
  return out;
}

export function parseEventLine(line: string): Event | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isEvent(x: unknown): x is Event {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e['seq'] === 'number' &&
    typeof e['at'] === 'string' &&
    typeof e['route'] === 'string' &&
    (e['by'] === 'user' || e['by'] === 'agent') &&
    typeof e['type'] === 'string' &&
    (EVENT_TYPES as readonly string[]).includes(e['type'])
  );
}

/** Highest `seq` in the text, 0 when there is none. */
export function lastSeq(jsonl: string): number {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = parseEventLine(lines[i] ?? '');
    if (e) return e.seq;
  }
  return 0;
}

export function eventsSince(events: readonly Event[], since: number): Event[] {
  return events.filter((e) => e.seq > since);
}

/** Stable key for deduping events that two writers may have given the same seq. */
export function eventKey(e: Event): string {
  return `${e.seq}:${e.type}:${e.annotationId ?? e.batchId ?? ''}`;
}
