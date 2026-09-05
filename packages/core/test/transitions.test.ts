import { describe, expect, it } from 'vitest';
import {
  ACTORS,
  IllegalTransitionError,
  STATUSES,
  TRANSITIONS,
  allowedTransitions,
  applyTransition,
  assignBatch,
  canTransition,
  resolutionFromMessage,
  type Actor,
  type Status,
} from '../src/index.js';
import { annotation } from './fixtures.js';

const LEGAL: [Status, Status, Actor][] = [
  ['draft', 'sent', 'user'],
  ['sent', 'acknowledged', 'agent'],
  ['sent', 'question', 'agent'],
  ['sent', 'review', 'agent'],
  ['sent', 'sent', 'user'],
  ['acknowledged', 'question', 'agent'],
  ['acknowledged', 'review', 'agent'],
  ['question', 'acknowledged', 'user'],
  ['review', 'approved', 'user'],
  ['review', 'sent', 'user'],
  ['approved', 'sent', 'user'],
];

function everyPair(): [Status, Status, Actor][] {
  const out: [Status, Status, Actor][] = [];
  for (const from of STATUSES) for (const to of STATUSES) for (const by of ACTORS) out.push([from, to, by]);
  return out;
}

describe('TRANSITIONS', () => {
  it('accepts exactly the legal moves', () => {
    for (const [from, to, by] of LEGAL) expect(canTransition(from, to, by)).toBe(true);
  });

  it('rejects every other move', () => {
    const legal = new Set(LEGAL.map((t) => t.join('|')));
    for (const [from, to, by] of everyPair()) {
      if (legal.has([from, to, by].join('|'))) continue;
      expect(canTransition(from, to, by), `${from}->${to} by ${by}`).toBe(false);
    }
  });

  it('has an entry for every status', () => {
    for (const s of STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });

  it('lists the allowed moves', () => {
    expect(allowedTransitions('sent', 'agent')).toEqual(['acknowledged', 'question', 'review']);
    expect(allowedTransitions('draft', 'agent')).toEqual([]);
  });
});

describe('applyTransition', () => {
  const now = '2026-09-06T09:00:00.000Z';

  it('throws on an illegal move and names the allowed ones', () => {
    const a = annotation({ status: 'draft', batch: null });
    expect(() => applyTransition(a, 'approved', 'user', undefined, now)).toThrow(
      IllegalTransitionError,
    );
    try {
      applyTransition(a, 'approved', 'user', undefined, now);
    } catch (err) {
      expect((err as IllegalTransitionError).allowed).toEqual(['sent']);
      expect((err as Error).message).toContain('allowed: sent');
    }
  });

  it('does not mutate its input', () => {
    const a = annotation({ status: 'sent' });
    const before = structuredClone(a);
    const next = applyTransition(a, 'acknowledged', 'agent', {
      role: 'agent',
      kind: 'comment',
      text: 'on it',
    }, now);
    expect(a).toEqual(before);
    expect(a.thread).toHaveLength(1);
    expect(next).not.toBe(a);
    expect(next.thread).not.toBe(a.thread);
    expect(next.thread).toHaveLength(2);
  });

  it('stamps sentAt on send but not on a re-send while sent', () => {
    const draft = annotation({ status: 'draft', batch: null, sentAt: null });
    const sent = applyTransition(draft, 'sent', 'user', undefined, now);
    expect(sent.sentAt).toBe(now);

    const edited = applyTransition(sent, 'sent', 'user', {
      role: 'user',
      kind: 'comment',
      text: 'also make it bold',
    }, '2026-09-06T09:05:00.000Z');
    expect(edited.sentAt).toBe(now);
    expect(edited.updatedAt).toBe('2026-09-06T09:05:00.000Z');
  });

  it('sets the resolution from a summary message', () => {
    const done = applyTransition(annotation({ status: 'acknowledged' }), 'review', 'agent', {
      role: 'agent',
      kind: 'summary',
      text: 'Matched the height in Pricing.svelte.',
    }, now);
    expect(done.status).toBe('review');
    expect(done.resolvedAt).toBe(now);
    expect(done.resolution).toEqual({ kind: 'changed', summary: 'Matched the height in Pricing.svelte.' });
  });

  it('sets the resolution from a decline message', () => {
    const declined = applyTransition(annotation({ status: 'acknowledged' }), 'review', 'agent', {
      role: 'agent',
      kind: 'decline',
      text: 'That button is owned by the design system.',
    }, now);
    expect(declined.resolution).toEqual({
      kind: 'declined',
      summary: 'That button is owned by the design system.',
    });
  });

  it('stamps approvedAt on approve', () => {
    const reviewed = annotation({
      status: 'review',
      resolvedAt: now,
      resolution: { kind: 'changed', summary: 'done' },
    });
    const approved = applyTransition(reviewed, 'approved', 'user', undefined, now);
    expect(approved.approvedAt).toBe(now);
    expect(approved.resolution).toEqual({ kind: 'changed', summary: 'done' });
  });

  it('clears the resolution and the batch on reopen', () => {
    const approved = annotation({
      status: 'approved',
      resolvedAt: now,
      approvedAt: now,
      resolution: { kind: 'changed', summary: 'done' },
    });
    const reopened = applyTransition(approved, 'sent', 'user', {
      role: 'user',
      kind: 'reopen',
      text: 'still uneven',
    }, '2026-09-06T10:00:00.000Z');
    expect(reopened.status).toBe('sent');
    expect(reopened.resolution).toBeNull();
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.approvedAt).toBeNull();
    expect(reopened.batch).toBeNull();
    expect(reopened.sentAt).toBe('2026-09-06T10:00:00.000Z');
  });

  it('answers a question back to acknowledged', () => {
    const asked = annotation({ status: 'question' });
    const answered = applyTransition(asked, 'acknowledged', 'user', {
      role: 'user',
      kind: 'answer',
      text: 'Only Pro. Free stays 40px.',
    }, now);
    expect(answered.status).toBe('acknowledged');
    expect(answered.thread.at(-1)?.kind).toBe('answer');
  });
});

describe('resolutionFromMessage', () => {
  it('maps summary and decline only', () => {
    expect(resolutionFromMessage({ role: 'agent', kind: 'summary', text: 'x' })).toEqual({
      kind: 'changed',
      summary: 'x',
    });
    expect(resolutionFromMessage({ role: 'agent', kind: 'decline', text: 'y' })).toEqual({
      kind: 'declined',
      summary: 'y',
    });
    expect(resolutionFromMessage({ role: 'user', kind: 'comment', text: 'z' })).toBeNull();
  });
});

describe('assignBatch', () => {
  it('attaches the batch and keeps the first sentAt', () => {
    const a = annotation({ batch: null, sentAt: null });
    const withBatch = assignBatch(a, '01JBZZZZZZ00000000000000B1', '2026-09-06T09:00:00.000Z');
    expect(withBatch.batch).toBe('01JBZZZZZZ00000000000000B1');
    expect(withBatch.sentAt).toBe('2026-09-06T09:00:00.000Z');
    expect(a.batch).toBeNull();
  });
});
