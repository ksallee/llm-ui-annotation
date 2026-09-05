import { describe, expect, it } from 'vitest';
import {
  eventKey,
  eventsSince,
  isEvent,
  lastSeq,
  parseEventLine,
  parseEvents,
  serializeEvent,
  type Event,
} from '../src/index.js';
import { BATCH, ELEMENT_ANNOTATION } from './fixtures.js';

const created: Event = {
  seq: 1,
  at: '2026-09-05T18:24:41.048Z',
  type: 'annotation.created',
  by: 'user',
  route: '/pricing',
  annotationId: ELEMENT_ANNOTATION.id,
  data: ELEMENT_ANNOTATION,
};

const sent: Event = {
  seq: 2,
  at: '2026-09-05T18:25:00.000Z',
  type: 'batch.sent',
  by: 'user',
  route: '/pricing',
  batchId: BATCH.id,
  data: BATCH,
};

describe('events jsonl', () => {
  it('round-trips through one line each', () => {
    const jsonl = serializeEvent(created) + serializeEvent(sent);
    expect(jsonl.split('\n').filter(Boolean)).toHaveLength(2);
    expect(parseEvents(jsonl)).toEqual([created, sent]);
  });

  it('drops blank and malformed lines', () => {
    const jsonl = `\n${serializeEvent(created)}not json\n{"seq":"x"}\n${serializeEvent(sent)}`;
    expect(parseEvents(jsonl)).toEqual([created, sent]);
    expect(parseEventLine('   ')).toBeNull();
    expect(parseEventLine('{}')).toBeNull();
  });

  it('reads the last seq from the tail, tolerating a clipped first line', () => {
    expect(lastSeq('')).toBe(0);
    expect(lastSeq('garbage\n')).toBe(0);
    expect(lastSeq(`{"seq":7,"typ` + `\n${serializeEvent(sent)}`)).toBe(2);
  });

  it('filters by cursor', () => {
    expect(eventsSince([created, sent], 1)).toEqual([sent]);
    expect(eventsSince([created, sent], 0)).toEqual([created, sent]);
  });

  it('keys events for dedupe', () => {
    expect(eventKey(created)).toBe(`1:annotation.created:${ELEMENT_ANNOTATION.id}`);
    expect(eventKey(sent)).toBe(`2:batch.sent:${BATCH.id}`);
  });

  it('recognises only well-formed events', () => {
    expect(isEvent(created)).toBe(true);
    expect(isEvent({ ...created, type: 'nope' })).toBe(false);
    expect(isEvent({ ...created, by: 'robot' })).toBe(false);
    expect(isEvent(null)).toBe(false);
  });
});
