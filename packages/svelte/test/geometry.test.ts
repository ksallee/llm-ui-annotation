import { describe, expect, it } from 'vitest';
import {
  coverage,
  cornerStyle,
  nearestCorner,
  place,
  rectFromPoints,
  relativeTime,
  sample,
  smoothPath,
  unionRects,
} from '../src/dom/geometry.js';
import { mergeRects, strokeBounds } from '../src/dom/core-dom.js';

const viewport = { width: 1000, height: 800 };

describe('place', () => {
  it('sits under the anchor when there is room', () => {
    expect(place({ x: 100, y: 100, width: 200, height: 40 }, { width: 360, height: 200 }, viewport)).toEqual({
      x: 100,
      y: 148,
    });
  });

  it('flips above the anchor when the card would fall out of view', () => {
    const at = place({ x: 100, y: 700, width: 200, height: 40 }, { width: 360, height: 200 }, viewport);
    expect(at.y).toBe(492);
  });

  it('clamps to the right edge', () => {
    const at = place({ x: 950, y: 100, width: 40, height: 40 }, { width: 360, height: 200 }, viewport);
    expect(at.x).toBe(632);
  });
});

describe('rect maths', () => {
  it('merges rects on the same line and keeps separate lines apart', () => {
    const merged = mergeRects([
      { x: 10, y: 10, width: 40, height: 18 },
      { x: 51, y: 10, width: 30, height: 18 },
      { x: 10, y: 30, width: 60, height: 18 },
    ]);
    expect(merged).toEqual([
      { x: 10, y: 10, width: 71, height: 18 },
      { x: 10, y: 30, width: 60, height: 18 },
    ]);
  });

  it('unions and measures coverage', () => {
    expect(unionRects([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 5, width: 10, height: 10 },
    ])).toEqual({ x: 0, y: 0, width: 30, height: 15 });
    expect(coverage({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 })).toBe(0.5);
    expect(rectFromPoints({ x: 30, y: 40 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 20, height: 30 });
  });

  it('pads stroke bounds, half the stroke width included', () => {
    expect(strokeBounds([{ tool: 'rect', rect: { x: 100, y: 100, width: 50, height: 20 }, color: 'x', width: 2 }], 10))
      .toEqual({ x: 89, y: 89, width: 72, height: 42 });
  });
});

describe('pill placement', () => {
  it('snaps to the nearest corner and clears the drawer', () => {
    expect(nearestCorner({ x: 900, y: 700 }, viewport)).toBe('br');
    expect(nearestCorner({ x: 10, y: 10 }, viewport)).toBe('tl');
    expect(cornerStyle('br', 20, 376)).toContain('right: 396px');
    expect(cornerStyle('tl', 20)).toContain('left: 20px');
  });
});

describe('brush sampling', () => {
  it('drops points closer than the minimum spacing', () => {
    expect(sample([[0, 0]], [1, 0])).toBe(false);
    expect(sample([[0, 0]], [4, 0])).toBe(true);
    expect(sample([], [0, 0])).toBe(true);
  });

  it('smooths through quadratic midpoints', () => {
    expect(smoothPath([[0, 0], [10, 0], [20, 10]])).toBe('M 0 0 Q 10 0 15 5 L 20 10');
    expect(smoothPath([])).toBe('');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-09-05T12:00:00.000Z');
  it('reads as a short duration', () => {
    expect(relativeTime('2026-09-05T11:59:50.000Z', now)).toBe('now');
    expect(relativeTime('2026-09-05T11:57:00.000Z', now)).toBe('3m');
    expect(relativeTime('2026-09-05T10:00:00.000Z', now)).toBe('2h');
    expect(relativeTime('2026-09-03T12:00:00.000Z', now)).toBe('2d');
    expect(relativeTime('nonsense', now)).toBe('');
  });
});
