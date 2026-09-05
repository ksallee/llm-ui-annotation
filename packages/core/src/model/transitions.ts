import { newId, nowIso } from './id.js';
import type {
  Actor,
  Annotation,
  Message,
  NewMessage,
  Resolution,
  Status,
} from './types.js';

export const TRANSITIONS: Record<Status, Partial<Record<Actor, Status[]>>> = {
  draft: { user: ['sent'] },
  sent: { agent: ['acknowledged', 'question', 'review'], user: ['sent'] },
  acknowledged: { agent: ['question', 'review'] },
  question: { user: ['acknowledged'] },
  review: { user: ['approved', 'sent'] },
  approved: { user: ['sent'] },
};

/** Statuses `by` may move `from` to. */
export function allowedTransitions(from: Status, by: Actor): Status[] {
  return TRANSITIONS[from][by] ?? [];
}

export function canTransition(from: Status, to: Status, by: Actor): boolean {
  return allowedTransitions(from, by).includes(to);
}

export class IllegalTransitionError extends Error {
  readonly from: Status;
  readonly to: Status;
  readonly by: Actor;
  readonly allowed: Status[];

  constructor(from: Status, to: Status, by: Actor) {
    const allowed = allowedTransitions(from, by);
    super(
      `illegal transition ${from} -> ${to} by ${by}; allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}`,
    );
    this.name = 'IllegalTransitionError';
    this.from = from;
    this.to = to;
    this.by = by;
    this.allowed = allowed;
  }
}

/** The resolution a `review` message implies, or null when the message is not one. */
export function resolutionFromMessage(msg: NewMessage | Message): Resolution | null {
  if (msg.kind === 'summary') return { kind: 'changed', summary: msg.text };
  if (msg.kind === 'decline') return { kind: 'declined', summary: msg.text };
  return null;
}

/** Stamp a `NewMessage` with an id and a timestamp. */
export function makeMessage(msg: NewMessage, at: string = nowIso()): Message {
  return { id: newId(Date.parse(at) || Date.now()), role: msg.role, kind: msg.kind, text: msg.text, at };
}

/**
 * Move an annotation to `to`, appending `msg` when given.
 *
 * @param a annotation to move; never mutated.
 * @param to target status.
 * @param by actor performing the move.
 * @param msg message to append; a `summary` or `decline` kind sets the resolution.
 * @param now ISO timestamp to stamp the result with.
 * @throws IllegalTransitionError when the move is not allowed.
 */
export function applyTransition(
  a: Annotation,
  to: Status,
  by: Actor,
  msg?: NewMessage,
  now: string = nowIso(),
): Annotation {
  if (!canTransition(a.status, to, by)) throw new IllegalTransitionError(a.status, to, by);

  const thread = msg ? [...a.thread, makeMessage(msg, now)] : a.thread.slice();
  const next: Annotation = { ...a, status: to, thread, updatedAt: now };

  if (to === 'sent' && a.status !== 'sent') next.sentAt = now;

  if (to === 'review') {
    next.resolvedAt = now;
    if (msg) next.resolution = resolutionFromMessage(msg) ?? a.resolution;
  }

  if (to === 'approved') next.approvedAt = now;

  const reopened = to === 'sent' && (a.status === 'review' || a.status === 'approved');
  if (reopened) {
    next.resolution = null;
    next.resolvedAt = null;
    next.approvedAt = null;
    next.batch = null;
  }

  return next;
}

/** Attach a batch id and mark the annotation sent. */
export function assignBatch(a: Annotation, batch: string, now: string = nowIso()): Annotation {
  return { ...a, batch, sentAt: a.sentAt ?? now, updatedAt: now };
}
