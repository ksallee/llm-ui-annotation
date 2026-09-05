/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import type { TextTarget } from '../../src/model/types.js';
import { mergeLineRects } from '../../src/dom/rect.js';
import { anchorText, describeRange, indexText, normalize } from '../../src/dom/text.js';
import { loadFixture, rect } from './helpers.js';

function textNodes(el: Node): Text[] {
  const out: Text[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) out.push(node as Text);
    else out.push(...textNodes(node));
  }
  return out;
}

function rangeOver(doc: Document, el: Element, needle: string, occurrence = 0): Range {
  let seen = 0;
  for (const node of textNodes(el)) {
    for (let i = node.data.indexOf(needle); i !== -1; i = node.data.indexOf(needle, i + 1)) {
      if (seen++ < occurrence) continue;
      const range = doc.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + needle.length);
      return range;
    }
  }
  throw new Error(`no ${needle}`);
}

function target(doc: Document, selector: string, needle: string, occurrence = 0): TextTarget {
  const el = doc.querySelector(selector) as Element;
  const result = describeRange(rangeOver(doc, el, needle, occurrence));
  if (!result.ok) throw new Error(result.reason);
  return result.target;
}

function normOffset(el: Element, range: Range): number {
  const index = indexText(el);
  return index.toNorm(index.offsetOf(range.startContainer, range.startOffset));
}

describe('normalize', () => {
  it('collapses runs, trims, and maps back to raw offsets', () => {
    const { text, map } = normalize('  a \n\t b   c  ');
    expect(text).toBe('a b c');
    expect(map(0)).toBe(2);
    expect(map(1)).toBe(3);
    expect(map(2)).toBe(7);
    expect(map(4)).toBe(11);
    expect(map(5)).toBe(14);
  });

  it('handles an all-whitespace string', () => {
    expect(normalize('   \n ').text).toBe('');
  });
});

describe('indexText', () => {
  it('joins text across inline elements', () => {
    const doc = loadFixture('prose');
    const index = indexText(doc.querySelector('#mixed') as Element);
    expect(index.text).toBe('Some emphasis and weight inside one paragraph.');
    const point = index.point(index.toRaw(5));
    expect(point?.node.data).toBe('emphasis');
  });
});

describe('describeRange', () => {
  it('records the quote, its neighbours and the container', () => {
    const doc = loadFixture('prose');
    const result = describeRange(rangeOver(doc, doc.querySelector('#lead') as Element, 'A selector alone'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.quote).toBe('A selector alone');
    expect(result.target.prefix).toBe('Text moves. ');
    expect(result.target.suffix).toContain(' is not enough');
    expect(result.target.container.selector).toBe('#lead');
    expect(result.target.start).toBe(12);
    expect(result.target.end).toBe(28);
  });

  it('refuses a selection spanning two blocks', () => {
    const doc = loadFixture('prose');
    const range = doc.createRange();
    range.setStart(textNodes(doc.querySelector('#first') as Element)[0] as Text, 0);
    range.setEnd(textNodes(doc.querySelector('#second') as Element)[0] as Text, 6);
    expect(describeRange(range)).toEqual({ ok: false, reason: 'multi-block' });
  });

  it('refuses an empty selection', () => {
    const doc = loadFixture('prose');
    const range = doc.createRange();
    range.setStart(textNodes(doc.querySelector('#lead') as Element)[0] as Text, 3);
    range.collapse(true);
    expect(describeRange(range)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('anchorText', () => {
  it('exact when nothing moved', () => {
    const doc = loadFixture('prose');
    const stored = target(doc, '#lead', 'A selector alone');
    const anchor = anchorText(doc, stored);
    expect(anchor?.state).toBe('exact');
    expect(anchor?.range.toString()).toBe('A selector alone');
  });

  it('disambiguates a repeated quote with the prefix', () => {
    const doc = loadFixture('prose');
    const el = doc.querySelector('#repeat') as Element;
    const stored = target(doc, '#repeat', 'The same phrase appears twice here.', 1);

    el.insertBefore(doc.createTextNode('Prelude. '), el.firstChild);
    const anchor = anchorText(doc, stored);
    expect(anchor?.state).toBe('moved');
    expect(anchor?.range.toString()).toBe('The same phrase appears twice here.');
    expect(normOffset(el, anchor?.range as Range)).toBe(indexText(el).text.lastIndexOf(stored.quote));
  });

  it('moved after an insertion before the quote', () => {
    const doc = loadFixture('prose');
    const el = doc.querySelector('#lead') as Element;
    const stored = target(doc, '#lead', 'A selector alone');
    el.insertBefore(doc.createTextNode('Editors note. '), el.firstChild);

    const anchor = anchorText(doc, stored);
    expect(anchor?.state).toBe('moved');
    expect(anchor?.range.toString()).toBe('A selector alone');
  });

  it('moved after an edit inside the quote', () => {
    const doc = loadFixture('prose');
    const el = doc.querySelector('#lead') as Element;
    const stored = target(doc, '#lead', 'A selector alone is not enough, so we store a quote');
    const node = textNodes(el)[0] as Text;
    node.data = node.data.replace('so we store a quote', 'so we keep a quote');

    const anchor = anchorText(doc, stored);
    expect(anchor?.state).toBe('moved');
    expect(anchor?.range.toString()).toContain('A selector alone is not enough');
  });

  it('lost after the quote is deleted', () => {
    const doc = loadFixture('prose');
    const el = doc.querySelector('#lead') as Element;
    const stored = target(doc, '#lead', 'A selector alone is not enough');
    (textNodes(el)[0] as Text).data = 'Text moves under you, and that is the whole problem.';
    expect(anchorText(doc, stored)).toBeNull();
  });

  it('re-finds the container through a fallback when its class changes', () => {
    const doc = loadFixture('prose');
    const stored = target(doc, '.note', 'class will change');
    expect(stored.container.selector).toBe('div.note');
    expect(stored.container.fallbacks.some((f) => f.startsWith('body > '))).toBe(true);

    (doc.querySelector('.note') as Element).setAttribute('class', 'callout loud');
    const anchor = anchorText(doc, stored);
    expect(anchor?.state).toBe('exact');
    expect(anchor?.range.toString()).toBe('class will change');
  });

  it('searches sibling containers when the container is gone', () => {
    const doc = loadFixture('prose');
    const stored = target(doc, '#second', 'Second paragraph');
    const section = doc.querySelector('#two-blocks') as Element;
    const moved = doc.createElement('p');
    moved.textContent = 'Second paragraph of the section.';
    (doc.querySelector('#second') as Element).replaceWith(moved);
    section.insertBefore(doc.createElement('p'), moved);

    expect(doc.querySelector('#second')).toBeNull();
    const anchor = anchorText(doc, stored);
    expect(anchor?.state).toBe('moved');
    expect(anchor?.range.toString()).toBe('Second paragraph');
  });
});

describe('mergeLineRects', () => {
  it('unions rects on the same line within two pixels', () => {
    expect(
      mergeLineRects([rect(10, 100, 30, 18), rect(41, 100, 20, 18), rect(10, 122, 50, 18)]),
    ).toEqual([rect(10, 100, 51, 18), rect(10, 122, 50, 18)]);
  });

  it('keeps rects apart when the gap is wider', () => {
    expect(mergeLineRects([rect(10, 100, 30, 18), rect(60, 100, 20, 18)])).toHaveLength(2);
  });
});
