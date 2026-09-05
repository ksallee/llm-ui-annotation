import { describe, expect, it } from 'vitest';
import { renderDoc, sectionKey, tagBlocks } from '../src/render.js';

const DOC = `# The Threshold

*A short document, for the test.*

## Opening

The first paragraph of the opening.

Light falls on the threshold first.

## The River

- one
- two

> A quote in its own block.

---

*A coda after the rule.*
`;

describe('renderDoc', () => {
  const model = renderDoc(DOC);

  it('splits title, epigraph, sections and coda', () => {
    expect(model.title).toBe('The Threshold');
    expect(model.epigraph?.html).toContain('A short document');
    expect(model.sections.map((s) => s.key)).toEqual(['opening', 'the-river']);
    expect(model.sections.map((s) => s.title)).toEqual(['Opening', 'The River']);
    expect(model.coda?.html).toContain('A coda after the rule');
  });

  it('numbers every block within its section', () => {
    const opening = model.sections[0]?.html ?? '';
    expect(opening).toContain('<h2 data-annot-block="opening/0"');
    expect(opening).toContain('<p data-annot-block="opening/1"');
    expect(opening).toContain('<p data-annot-block="opening/2"');
  });

  it('tags list items and quotes too', () => {
    const river = model.sections[1]?.html ?? '';
    expect(river).toContain('<li data-annot-block="the-river/1"');
    expect(river).toContain('<blockquote data-annot-block="the-river/3"');
  });

  it('shifts the indices below an inserted paragraph', () => {
    const edited = DOC.replace('Light falls', 'Inserted paragraph.\n\nLight falls');
    const opening = renderDoc(edited).sections[0]?.html ?? '';
    expect(opening).toContain('>Inserted paragraph.</p>');
    expect(opening).toMatch(/<p data-annot-block="opening\/3"[^>]*>Light falls/);
  });

  it('keeps GFM tables and leaves fenced code alone', () => {
    const html = renderDoc('## S\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```\n## not a heading\n```\n').sections[0]
      ?.html;
    expect(html).toContain('<td data-annot-block="s/');
    expect(html).toContain('## not a heading');
  });
});

describe('sectionKey', () => {
  it('slugs and deduplicates', () => {
    const taken = new Set<string>();
    expect(sectionKey('The River', taken)).toBe('the-river');
    expect(sectionKey('The river!', taken)).toBe('the-river-2');
    expect(sectionKey('…', taken)).toBe('s');
  });
});

describe('tagBlocks', () => {
  it('keeps existing attributes', () => {
    expect(tagBlocks('<p class="x">a</p>', 'k')).toBe('<p data-annot-block="k/0" class="x">a</p>');
  });
});
