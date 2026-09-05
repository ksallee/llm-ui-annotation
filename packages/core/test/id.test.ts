import { describe, expect, it } from 'vitest';
import { ID_LENGTH, ID_PATTERN, compareIds, idTime, isId, newId, nowIso } from '../src/index.js';

describe('newId', () => {
  it('is 26 Crockford base32 chars', () => {
    const id = newId();
    expect(id).toHaveLength(ID_LENGTH);
    expect(ID_PATTERN.test(id)).toBe(true);
    expect(isId(id)).toBe(true);
  });

  it('sorts chronologically across milliseconds', () => {
    const ids = [1, 2, 3, 4, 5].map((n) => newId(1_757_000_000_000 + n));
    expect([...ids].sort()).toEqual(ids);
  });

  it('sorts strictly within one millisecond', () => {
    const ids = Array.from({ length: 500 }, () => newId(1_757_000_000_000));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('stays sortable when real time advances', () => {
    const ids = Array.from({ length: 200 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });

  it('round-trips the time prefix', () => {
    const t = 1_757_000_123_456;
    expect(idTime(newId(t))).toBe(t);
  });

  it('rejects out-of-range times', () => {
    expect(() => newId(-1)).toThrow(RangeError);
    expect(() => newId(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  it('rejects malformed ids', () => {
    expect(isId('01JBZZZZZZ000000000000001')).toBe(false);
    expect(isId('01jbzzzzzz0000000000000010')).toBe(false);
    expect(isId('01JBZZZZZZ00000000000000IL')).toBe(false);
    expect(isId(42)).toBe(false);
  });
});

describe('compareIds', () => {
  it('orders lexicographically', () => {
    expect(compareIds('A', 'B')).toBe(-1);
    expect(compareIds('B', 'A')).toBe(1);
    expect(compareIds('A', 'A')).toBe(0);
  });
});

describe('nowIso', () => {
  it('is ISO 8601 UTC', () => {
    expect(nowIso(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
