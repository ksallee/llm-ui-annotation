/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { contentFrame } from '../../src/dom/frame.js';
import { applyLayout } from './helpers.js';

const page = (): Document => {
  document.body.innerHTML = `
    <nav data-rect="0,0,1280,60"></nav>
    <main data-rect="240,100,800,600">
      <section data-rect="240,300,800,200">
        <article data-rect="240,300,240,200"></article>
        <article data-rect="520,300,240,200"></article>
      </section>
    </main>`;
  applyLayout(document);
  return document;
};

describe('contentFrame', () => {
  it('widens to the column holding the marks, and keeps their height', () => {
    // a mark scribbled across both cards belongs to the section, not to one card
    const frame = contentFrame(page(), { x: 300, y: 340, width: 400, height: 60 }, { padding: 20 });
    expect(frame).toEqual({ x: 220, y: 320, width: 840, height: 100 });
  });

  it('picks the narrowest block that still spans the marks', () => {
    // inside one card, the card is the column
    const frame = contentFrame(page(), { x: 260, y: 340, width: 100, height: 40 }, { padding: 20, minWidth: 100 });
    expect(frame.x).toBe(220);
    expect(frame.width).toBe(280);
  });

  it('falls back to the marks when nothing spans them', () => {
    document.body.innerHTML = '';
    const frame = contentFrame(document, { x: 50, y: 60, width: 30, height: 20 }, { padding: 10 });
    expect(frame).toEqual({ x: 40, y: 50, width: 50, height: 40 });
  });

  it('never runs off the top or left of the document', () => {
    const frame = contentFrame(page(), { x: 5, y: 5, width: 10, height: 10 }, { padding: 40 });
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
  });
});
