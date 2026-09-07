/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { boxModel, elementCard, hexOf, inspectElement, shorthand } from '../src/dom/inspect.js';
import { namedToken } from '../src/dom/style-edit.js';

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

});

describe('the devtools card', () => {
  it('writes the sides as CSS shorthand', () => {
    expect(shorthand({ top: 8, right: 8, bottom: 8, left: 8 })).toBe('8px');
    expect(shorthand({ top: 8, right: 16, bottom: 8, left: 16 })).toBe('8px 16px');
    expect(shorthand({ top: 16, right: 0, bottom: 0, left: 0 })).toBe('16px 0px 0px');
    expect(shorthand({ top: 1, right: 2, bottom: 3, left: 4 })).toBe('1px 2px 3px 4px');
  });

  it('writes an opaque colour as hex and leaves anything else alone', () => {
    expect(hexOf('rgb(31, 41, 55)')).toBe('#1f2937');
    expect(hexOf('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('carries the gap and the shadow a design note needs', () => {
    document.body.innerHTML =
      '<div id="bar" style="display: flex; gap: 12px; box-shadow: 0 1px 2px red; background: #fff"><span>a</span></div>';
    const card = elementCard(document.querySelector('#bar')!)!;
    expect(card.rows.find((r) => r.name === 'Gap')?.value).toBe('12px');
    expect(card.rows.find((r) => r.name === 'Shadow')?.value).toContain('red');
    expect(card.rows.find((r) => r.name === 'Background')?.value).toMatch(/^#f{3,6}$/);
  });

  it('names the token behind a value, and only from that property\u2019s own family', () => {
    const tokens = new Map([['12px', '--radius-md']]);
    expect(namedToken('border-radius', '12px', tokens)).toBe('--radius-md');
    // The same value, the wrong family: a coincidence, not the source.
    expect(namedToken('padding', '12px', tokens)).toBeNull();
  });

  it('reads a computed line-height back to the ratio its token is written as', () => {
    const tokens = new Map([['1.15', '--leading-tight']]);
    expect(namedToken('line-height', '41.4px', tokens)).toBeNull();
    expect(namedToken('line-height', '41.4px', tokens, 36)).toBe('--leading-tight');
  });

  it('titles the node the way devtools does and reads the box off it', () => {
    document.body.innerHTML =
      '<main><button id="go" class="btn primary" style="padding: 8px 16px; margin: 4px">Save</button></main>';
    const card = elementCard(document.querySelector('#go')!)!;
    expect(card.label).toEqual({ tag: 'button', id: 'go', classes: ['btn', 'primary'] });
    expect(card.rows.find((r) => r.name === 'Padding')?.value).toBe('8px 16px');
    expect(card.rows.find((r) => r.name === 'Margin')?.value).toBe('4px');
    expect(card.a11y.find((r) => r.name === 'Role')?.value).toBe('button');
    expect(card.rows.find((r) => r.name === 'Background')).toBeUndefined();
    expect(card.a11y.find((r) => r.name === 'Name')?.value).toBe('Save');
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
