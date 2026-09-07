/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { describeElement } from '../../src/dom/describe.js';
import {
  declaredTokens,
  normalizeValue,
  resolveDeclared,
  resolveTokens,
  tokenMap,
} from '../../src/dom/tokens.js';
import { renderAnnotationMarkdown } from '../../src/protocol/markdown.js';
import type { Annotation, ElementRef } from '../../src/model/types.js';
import { annotation } from '../fixtures.js';

function page(html: string): Document {
  document.head.innerHTML = '';
  document.body.innerHTML = html;
  return document;
}

function styled(css: string, body: string): Element {
  const doc = page(body);
  doc.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  return doc.querySelector('[data-target]') as Element;
}

/** A stylesheet that refuses to be read, as a cross-origin one does. */
function makeUnreadable(doc: Document): void {
  doc.head.insertAdjacentHTML('beforeend', '<style>:root{--ignored:#000}</style>');
  const sheet = doc.styleSheets[doc.styleSheets.length - 1] as CSSStyleSheet;
  Object.defineProperty(sheet, 'cssRules', {
    get() {
      throw new Error('SecurityError');
    },
  });
}

function annotationWith(el: ElementRef): Annotation {
  return annotation({ target: { kind: 'element', elements: [el] } });
}

describe('normalizeValue', () => {
  it('brings colors, lengths and text to one form', () => {
    expect(normalizeValue('#2c8a85')).toBe(normalizeValue('rgb(44, 138, 133)'));
    expect(normalizeValue('red')).toBe(normalizeValue('#ff0000'));
    expect(normalizeValue('0.75rem')).toBe('12px');
    expect(normalizeValue('12pt')).toBe('16px');
    expect(normalizeValue('0')).toBe('0px');
    expect(normalizeValue('ui-sans-serif , system-ui')).toBe('ui-sans-serif,system-ui');
  });

  it('sees through the original kept beside a converted color', () => {
    expect(normalizeValue('oklch(0.628 0.258 29.23) (#ff0000)')).toBe(normalizeValue('red'));
  });
});

describe('tokenMap', () => {
  it('matches a hex declaration against a computed oklch value', () => {
    const el = styled(
      ':root{--brand:#2c8a85}button.cta{background:var(--brand)}',
      '<button class="cta" data-target>Go</button>',
    );
    const ref = describeElement(el);
    expect(ref.tokens?.['background-color']).toBe('--brand');
  });

  it('resolves each part of a shorthand, and only when every part lands', () => {
    const el = styled(
      ':root{--space-3:12px;--space-4:1rem}.box{padding:var(--space-3) var(--space-4);border:2px solid #2c8a85}',
      '<div class="box" data-target>x</div>',
    );
    const ref = describeElement(el);
    expect(ref.styles?.['padding']).toBe('12px 16px');
    expect(ref.tokens?.['padding']).toBe('--space-3 --space-4');
    expect(ref.tokens?.['border']).toBeUndefined();
  });

  it('follows a token that aliases another', () => {
    const el = styled(
      ':root{--brand:#2c8a85;--button-background:var(--brand)}.cta{background:var(--button-background)}',
      '<button class="cta" data-target>Go</button>',
    );
    expect(describeElement(el).tokens?.['background-color']).toBe('--brand');
  });

  it('prefers the token declared on the closer ancestor', () => {
    const el = styled(
      ':root{--page-accent:#2c8a85}.card{--local:#2c8a85}.cta{background:#2c8a85}',
      '<div class="card"><button class="cta" data-target>Go</button></div>',
    );
    expect(describeElement(el).tokens?.['background-color']).toBe('--local');
  });

  it('ignores a token declared outside the element ancestry', () => {
    const doc = page('<div class="other"></div><button class="cta" data-target>Go</button>');
    doc.head.insertAdjacentHTML(
      'beforeend',
      '<style>.other{--elsewhere:#2c8a85}.cta{background:#2c8a85}</style>',
    );
    const el = doc.querySelector('[data-target]') as Element;
    expect(describeElement(el).tokens).toBeUndefined();
    expect(tokenMap(doc).size).toBe(0);
  });

  it('skips a stylesheet it cannot read, counts it, and resolves the rest', () => {
    const doc = page('<button class="cta" data-target>Go</button>');
    makeUnreadable(doc);
    doc.head.insertAdjacentHTML('beforeend', '<style>:root{--brand:#2c8a85}</style>');
    const el = doc.querySelector('[data-target]') as Element;
    const map = tokenMap(doc, el);
    expect(map.skipped).toBe(1);
    expect(resolveTokens({ 'background-color': '#2c8a85' }, map)).toEqual({
      'background-color': '--brand',
    });
  });

  it('reports no skipped sheets when every one reads', () => {
    const doc = page('<button data-target>Go</button>');
    doc.head.insertAdjacentHTML('beforeend', '<style>:root{--brand:#2c8a85}</style>');
    expect(tokenMap(doc).skipped).toBe(0);
  });
});

describe('markdown', () => {
  it('puts the token beside the value at standard and detailed, and not at compact', () => {
    const el = styled(
      ':root{--brand:#2c8a85;--text-sm:14px}.cta{background:var(--brand);font-size:var(--text-sm)}',
      '<button class="cta" data-target>Go</button>',
    );
    const ref = describeElement(el);
    const a = annotationWith(ref);
    const standard = renderAnnotationMarkdown(a, { level: 'standard', dir: '/repo/.annotations' });
    expect(standard).toContain('var(--brand)');
    expect(standard).toContain('font-size 14px var(--text-sm)');
    expect(renderAnnotationMarkdown(a, { level: 'compact', dir: '/x' })).not.toContain('var(--');
  });

  it('renders an element with no tokens exactly as it did before tokens existed', () => {
    const el = styled('.cta{background:#2c8a85;font-size:14px}', '<button class="cta" data-target>Go</button>');
    const ref = describeElement(el);
    expect(ref.tokens).toBeUndefined();
    expect(Object.hasOwn(ref, 'tokens')).toBe(false);

    const withToken: ElementRef = { ...ref, tokens: { 'font-size': '--text-sm' } };
    const opts = { level: 'detailed', dir: '/repo/.annotations' } as const;
    expect(renderAnnotationMarkdown(annotationWith(ref), opts)).not.toContain('var(--');
    expect(renderAnnotationMarkdown(annotationWith(withToken), opts)).toContain(
      'font-size 14px var(--text-sm)',
    );
  });
});

describe('values a page writes against its own font size', () => {
  const MAP = new Map([
    ['1.15', '--leading-tight'],
    ['-0.01em', '--tracking-tight'],
  ]);

  it('reads a computed line-height and letter-spacing back to the token', () => {
    const styles = { 'line-height': '41.4px', 'letter-spacing': '-0.36px' };
    expect(resolveTokens(styles, MAP)).toEqual({});
    expect(resolveTokens(styles, MAP, 36)).toEqual({
      'line-height': '--leading-tight',
      'letter-spacing': '--tracking-tight',
    });
  });

  it('leaves a length whose basis it does not know', () => {
    expect(resolveTokens({ padding: '41.4px' }, MAP, 36)).toEqual({});
  });

  it('prefers the ratio over a spacing token that happens to share the computed px', () => {
    const map = new Map([
      ['1.6', '--leading-body'],
      ['24px', '--space-5'],
    ]);
    expect(resolveTokens({ 'line-height': '24px' }, map, 15)).toEqual({
      'line-height': '--leading-body',
    });
    expect(resolveTokens({ 'line-height': '24px' }, map)).toEqual({ 'line-height': '--space-5' });
  });
});

describe('resolveDeclared', () => {
  const DECLARED = new Map([
    ['--space-2', '8px'],
    ['--radius-md', '8px'],
    ['--brand', normalizeValue('#2c8a85')],
  ]);

  it('takes the name from the property’s own family when a value is shared', () => {
    expect(resolveDeclared({ 'border-radius': '8px' }, DECLARED)).toEqual({
      'border-radius': '--radius-md',
    });
    expect(resolveDeclared({ padding: '8px' }, DECLARED)).toEqual({ padding: '--space-2' });
  });

  it('refuses a name that belongs to another family, and keeps one that belongs to none', () => {
    const spacingOnly = new Map([['--space-2', '8px']]);
    expect(resolveDeclared({ 'border-radius': '8px' }, spacingOnly)).toEqual({});
    expect(resolveDeclared({ 'background-color': '#2c8a85' }, DECLARED)).toEqual({
      'background-color': '--brand',
    });
  });
});

describe('shadows', () => {
  it('reads the same whichever end the colour is written at', () => {
    const declared = normalizeValue('0 1px 2px rgba(16, 18, 21, 0.06)');
    const computed = normalizeValue('rgba(16, 18, 21, 0.06) 0px 1px 2px 0px');
    expect(computed).toBe(declared);
    expect(resolveTokens({ 'box-shadow': computed }, new Map([[declared, '--shadow-sm']]))).toEqual({
      'box-shadow': '--shadow-sm',
    });
  });

  it('keeps a spread that is not zero, and an inset', () => {
    expect(normalizeValue('rgb(0, 0, 0) 0px 1px 2px 3px')).toContain('3px');
    expect(normalizeValue('rgb(0, 0, 0) 0px 1px 2px 0px inset')).toContain('inset');
  });

  it('leaves a border alone, which is one length and a colour', () => {
    expect(normalizeValue('1px solid rgb(229, 228, 224)')).toBe('1px solid rgb(229,228,224)');
  });
});

describe('declaredTokens', () => {
  it('keeps every name, including two that share a value', () => {
    const el = styled(
      ':root{--space-3:12px;--text-xs:12px}button.cta{padding:12px}',
      '<button class="cta" data-target>Go</button>',
    );
    const doc = el.ownerDocument;
    expect([...tokenMap(doc, el).values()]).toEqual(['--space-3']);
    expect(declaredTokens(doc, el)).toEqual(
      new Map([
        ['--space-3', '12px'],
        ['--text-xs', '12px'],
      ]),
    );
  });
});

describe('a browser that gives every style rule a cssRules list', () => {
  it('still reads the declarations of a style rule', () => {
    const el = styled(
      ':root{--brand:#2c8a85}button.cta{background:var(--brand)}',
      '<button class="cta" data-target>Go</button>',
    );
    // Since CSS nesting, Chrome's CSSStyleRule carries an empty `cssRules` of its own.
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if ((rule as CSSStyleRule).selectorText === undefined) continue;
        Object.defineProperty(rule, 'cssRules', { get: () => [] as unknown as CSSRuleList });
      }
    }
    expect(describeElement(el).tokens?.['background-color']).toBe('--brand');
  });
});
