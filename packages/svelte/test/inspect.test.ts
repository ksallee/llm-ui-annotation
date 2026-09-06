/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { boxDrawable, boxModel, inspectElement, MIN_BOX } from '../src/dom/inspect.js';

function element(style: string, tag = 'div'): Element {
  document.body.innerHTML = `<main><section><${tag} id="t" style="${style}">hi</${tag}></section></main>`;
  return document.querySelector('#t')!;
}

describe('boxModel', () => {
  it('reads the four sides of margin, border and padding', () => {
    const box = boxModel(element('padding: 10px 12px; border: 2px solid red; margin: 4px 0 6px 0'))!;
    expect(box.padding).toEqual({ top: 10, right: 12, bottom: 10, left: 12 });
    expect(box.border).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    expect(box.margin).toEqual({ top: 4, right: 0, bottom: 6, left: 0 });
  });

  it('declines to draw under 24 px in either direction', () => {
    const box = boxModel(element('padding: 4px'))!;
    expect(boxDrawable({ ...box, borderBox: { x: 0, y: 0, width: MIN_BOX, height: MIN_BOX } })).toBe(true);
    expect(boxDrawable({ ...box, borderBox: { x: 0, y: 0, width: 200, height: 23 } })).toBe(false);
    expect(boxDrawable({ ...box, borderBox: { x: 0, y: 0, width: 18, height: 200 } })).toBe(false);
  });
});

describe('inspectElement', () => {
  it('names the element, its chain to body, and holds the styles the annotation would carry', () => {
    const seen = inspectElement(element('padding: 8px', 'button'), true);
    expect(seen.chain).toEqual(['body', 'main', 'section', 'button']);
    expect(seen.role).toBe('button');
    expect(seen.selector).toContain('#t');
    expect(seen.styles).not.toBeNull();
  });

  it('carries no styles when the detail level sends none', () => {
    expect(inspectElement(element('padding: 8px'), false).styles).toBeNull();
  });
});
