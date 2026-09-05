/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import { captureRegion, pickCaptureTarget } from '../../src/dom/capture.js';
import { loadFixture, rect, setRect } from './helpers.js';

function stubCanvas(doc: Document): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_t, prop) =>
      (...args: unknown[]) => {
        calls.push(`${String(prop)}(${args.join(', ')})`);
      },
    set: () => true,
  });
  const create = doc.createElement.bind(doc);
  doc.createElement = ((tag: string) => {
    if (tag !== 'canvas') return create(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (blob: Blob) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement;
  }) as Document['createElement'];
  return { calls, restore: () => (doc.createElement = create as Document['createElement']) };
}

describe('pickCaptureTarget', () => {
  it('picks the smallest element covering the region', () => {
    const doc = loadFixture('cards');
    const card = doc.querySelector('.card') as Element;
    setRect(doc.body, rect(0, 0, 1200, 900));
    expect(pickCaptureTarget(doc, rect(60, 120, 200, 100))).toBe(card);
  });

  it('skips the overlay host', () => {
    const doc = loadFixture('cards');
    const overlay = doc.createElement('annot-overlay');
    doc.body.appendChild(overlay);
    setRect(overlay, rect(0, 0, 1200, 900));
    setRect(doc.body, rect(0, 0, 1200, 900));
    expect(pickCaptureTarget(doc, rect(60, 120, 200, 100))).not.toBe(overlay);
  });
});

describe('captureRegion', () => {
  it('crops, composites the strokes and returns a png', async () => {
    const doc = loadFixture('cards');
    setRect(doc.body, rect(0, 0, 1200, 900));
    const { calls, restore } = stubCanvas(doc);
    const source = { width: 800, height: 380 } as HTMLCanvasElement;

    const blob = await captureRegion(
      doc,
      rect(60, 120, 200, 100),
      [{ tool: 'rect', rect: { x: 70, y: 130, width: 20, height: 20 }, color: '#f00', width: 2 }],
      { domToCanvas: () => Promise.resolve(source), padding: 0 },
    );

    expect(blob?.type).toBe('image/png');
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(true);
    expect(calls.some((c) => c.startsWith('rect('))).toBe(true);
    restore();
  });

  it('returns null and restores the overlay when the capture throws', async () => {
    const doc = loadFixture('cards');
    const overlay = doc.createElement('annot-overlay') as HTMLElement;
    overlay.style.visibility = 'visible';
    doc.body.appendChild(overlay);
    setRect(doc.body, rect(0, 0, 1200, 900));

    const domToCanvas = vi.fn(() => Promise.reject(new Error('boom')));
    const blob = await captureRegion(doc, rect(60, 120, 200, 100), [], { domToCanvas });

    expect(blob).toBeNull();
    expect(domToCanvas).toHaveBeenCalled();
    expect(overlay.style.visibility).toBe('visible');
  });

  it('returns null when there is no 2d context', async () => {
    const doc = loadFixture('cards');
    setRect(doc.body, rect(0, 0, 1200, 900));
    const blob = await captureRegion(doc, rect(60, 120, 200, 100), [], {
      domToCanvas: () => Promise.resolve({ width: 10, height: 10 } as HTMLCanvasElement),
    });
    expect(blob).toBeNull();
  });
});
