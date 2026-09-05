/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../../src/model/types.js';
import { labelBox, renderStrokes, strokeBounds, type StrokeContext } from '../../src/dom/strokes.js';

const STROKES: Stroke[] = [
  { tool: 'brush', points: [[10, 10], [20, 30], [40, 20], [60, 50]], color: '#e11d48', width: 4 },
  { tool: 'arrow', from: [80, 20], to: [140, 80], color: '#2563eb', width: 3 },
  { tool: 'rect', rect: { x: 150, y: 10, width: 60, height: 40 }, color: '#16a34a', width: 2 },
  { tool: 'ellipse', rect: { x: 220, y: 10, width: 80, height: 40 }, color: '#a855f7', width: 2 },
  { tool: 'label', at: [10, 120], text: 'Too tight', color: '#f8fafc', size: 14 },
];

function recorder(): { calls: string[]; ctx: StrokeContext } {
  const calls: string[] = [];
  const show = (v: unknown): string =>
    typeof v === 'number' ? String(Math.round(v * 100) / 100) : JSON.stringify(v);
  const ctx = new Proxy({} as StrokeContext, {
    get:
      (_t, prop) =>
      (...args: unknown[]) => {
        calls.push(`${String(prop)}(${args.map(show).join(', ')})`);
      },
    set: (_t, prop, value) => {
      calls.push(`${String(prop)} = ${show(value)}`);
      return true;
    },
  });
  return { calls, ctx };
}

describe('strokeBounds', () => {
  it('covers every stroke plus the padding', () => {
    expect(strokeBounds(STROKES)).toEqual({ x: -16, y: -16, width: 341, height: 187.6 });
  });

  it('takes a custom padding and survives an empty list', () => {
    expect(strokeBounds([STROKES[2] as Stroke], 0)).toEqual({ x: 149, y: 9, width: 62, height: 42 });
    expect(strokeBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('sizes a label pill without measuring text', () => {
    expect(labelBox('abc', 10)).toEqual({ width: 26, height: 22 });
  });
});

describe('renderStrokes', () => {
  it('draws the same calls every time', () => {
    const { calls, ctx } = recorder();
    renderStrokes(ctx, STROKES, { x: 0, y: 0 }, 1);
    expect(calls).toMatchSnapshot();
  });

  it('translates by the origin and scales', () => {
    const { calls, ctx } = recorder();
    renderStrokes(
      ctx,
      [{ tool: 'rect', rect: { x: 100, y: 100, width: 50, height: 20 }, color: '#000', width: 2 }],
      { x: 90, y: 80 },
      2,
    );
    expect(calls).toContain('rect(20, 40, 100, 40)');
    expect(calls).toContain('lineWidth = 4');
  });
});
