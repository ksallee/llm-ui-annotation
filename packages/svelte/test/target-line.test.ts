import type { ElementRef } from '@llm-ui-annotation/core';
import { describe, expect, it } from 'vitest';
import { targetLine } from '../src/ui/target-line.js';

const SELECTOR = 'main > section.pricing > article:nth-of-type(2) > div.body > button.cta';

const ref = (over: Partial<ElementRef> = {}): ElementRef => ({
  selector: SELECTOR,
  fallbacks: [],
  tag: 'button',
  role: 'button',
  name: 'Choose Pro',
  text: 'Choose Pro',
  rect: { x: 0, y: 0, width: 10, height: 10 },
  fixed: false,
  attrs: {},
  ...over,
});

describe('targetLine', () => {
  it('keeps the element name whole and gives up the head of the selector', () => {
    const line = targetLine({ kind: 'element', elements: [ref()] });
    expect(line.name).toBe('button "Choose Pro"');
    expect(line.where.startsWith('…')).toBe(true);
    expect(line.where.endsWith('button.cta')).toBe(true);
  });

  it('leaves a short selector alone', () => {
    const line = targetLine({ kind: 'element', elements: [ref({ selector: 'button.cta' })] });
    expect(line.where).toBe('button.cta');
  });

  it('counts the rest of a multi-select after the first name', () => {
    const line = targetLine({
      kind: 'element',
      elements: [ref(), ref({ name: 'Pricing', tag: 'a' }), ref({ name: 'Plans', tag: 'h2' })],
    });
    expect(line.name).toBe('button "Choose Pro" +2');
  });

  it('quotes the text run and names the blocks it spans', () => {
    const line = targetLine({
      kind: 'text',
      quote: 'Cancel anytime',
      prefix: '',
      suffix: '',
      start: 0,
      end: 14,
      container: ref({ selector: 'p.lede', tag: 'p' }),
      rects: [],
      blocks: [ref({ selector: 'p.lede', tag: 'p' }), ref({ selector: 'blockquote.pull', tag: 'blockquote' })],
    });
    expect(line.name).toBe('"Cancel anytime"');
    expect(line.where).toBe('across p.lede, blockquote.pull');
  });

  it('names a drawing by what it covers, and by its strokes when it covers nothing', () => {
    const region = { x: 0, y: 0, width: 100, height: 100 };
    expect(
      targetLine({ kind: 'page', region, strokes: [], screenshot: null, elements: [ref(), ref()] }).name,
    ).toBe('drawing over 2 elements');
    expect(
      targetLine({
        kind: 'page',
        region,
        strokes: [{ tool: 'rect', rect: region, color: '#000', width: 3 }],
        screenshot: null,
        elements: [],
      }).name,
    ).toBe('drawing, 1 stroke');
  });
});
