import { describe, expect, it } from 'vitest';
import {
  renderAnnotationMarkdown,
  renderAnswerMarkdown,
  renderBatchMarkdown,
  renderReopenMarkdown,
  type RenderLevel,
} from '../src/index.js';
import {
  ALL_ANNOTATIONS,
  BATCH,
  PAGE_ANNOTATION,
  TEXT_MULTI_ANNOTATION,
  annotation,
  elementRef,
  message,
} from './fixtures.js';

const DIR = '/repo/.annotations';
const LEVELS: RenderLevel[] = ['compact', 'standard', 'detailed'];

describe('renderBatchMarkdown', () => {
  for (const level of LEVELS) {
    it(`matches the ${level} snapshot`, () => {
      expect(renderBatchMarkdown(BATCH, ALL_ANNOTATIONS, { level, dir: DIR })).toMatchSnapshot();
    });
  }

  it('opens with the batch header and the user summary', () => {
    const md = renderBatchMarkdown(BATCH, ALL_ANNOTATIONS, { level: 'standard', dir: DIR });
    expect(md.split('\n')[0]).toBe(
      `## Feedback batch ${BATCH.id}  ·  route /pricing  ·  3 items`,
    );
    expect(md).toContain('Summary from the user: all of these are about the pricing table spacing.');
  });

  it('ends every item with its full id', () => {
    const md = renderBatchMarkdown(BATCH, ALL_ANNOTATIONS, { level: 'standard', dir: DIR });
    for (const a of ALL_ANNOTATIONS) expect(md).toContain(`id: ${a.id}`);
  });

  it('closes with the verb reminder', () => {
    const md = renderBatchMarkdown(BATCH, ALL_ANNOTATIONS, { level: 'standard', dir: DIR });
    expect(md.trimEnd().endsWith('--reason "…"')).toBe(true);
  });

  it('keeps the order of annotationIds and skips ids it was not given', () => {
    const md = renderBatchMarkdown(
      { ...BATCH, annotationIds: [PAGE_ANNOTATION.id, 'missing'] },
      ALL_ANNOTATIONS,
      { level: 'compact', dir: DIR },
    );
    expect(md).toContain('1 item');
    expect(md).toContain('### #6');
    expect(md).not.toContain('### #4');
  });

  it('gives page items an absolute screenshot path with the region size', () => {
    const md = renderBatchMarkdown(BATCH, ALL_ANNOTATIONS, { level: 'standard', dir: DIR });
    expect(md).toContain(
      'screenshot: /repo/.annotations/screenshots/01JBZZZZZZZZZZZZZZZZZZZZZZ.png  (1180×640)',
    );
  });

  it('carries the words the user wrote onto the drawing', () => {
    for (const level of ['compact', 'standard', 'detailed'] as const) {
      const md = renderAnnotationMarkdown(PAGE_ANNOTATION, { level, dir: DIR });
      expect(md, level).toContain('captions: "gaps uneven here"');
    }
  });

  it('says so when the capture failed', () => {
    const failed = { ...PAGE_ANNOTATION, target: { ...PAGE_ANNOTATION.target, screenshot: null } };
    const md = renderAnnotationMarkdown(failed as typeof PAGE_ANNOTATION, {
      level: 'standard',
      dir: DIR,
    });
    expect(md).toContain('screenshot: none (capture failed)');
  });
});

describe('a text run across blocks', () => {
  const md = (level: RenderLevel) => renderAnnotationMarkdown(TEXT_MULTI_ANNOTATION, { level, dir: DIR });

  it('names the spanned blocks in the header at every level', () => {
    for (const level of LEVELS) {
      expect(md(level).split('\n')[0]).toBe(
        '### #7 · text · across p.lede, blockquote.pull, section.terms > p:nth-of-type(2)',
      );
    }
  });

  it('lists them again with the container, but not when compact', () => {
    expect(md('standard')).toContain(
      'blocks: p.lede, blockquote.pull, section.terms > p:nth-of-type(2)',
    );
    expect(md('standard')).toContain('container: section.terms');
    expect(md('compact')).not.toContain('blocks:');
  });
});

describe('render levels', () => {
  const md = (level: RenderLevel) => renderBatchMarkdown(BATCH, ALL_ANNOTATIONS, { level, dir: DIR });

  it('compact drops styles, context, prefix and suffix', () => {
    const out = md('compact');
    expect(out).not.toContain('styles:');
    expect(out).not.toContain('context:');
    expect(out).not.toContain('prefix:');
    expect(out).not.toContain('suffix:');
  });

  it('standard keeps styles and context but not fallbacks or attrs', () => {
    const out = md('standard');
    expect(out).toContain('styles: font-size 14px · padding 10px 18px');
    expect(out).toContain('context: parent article "Pro", prev p "$29 / month", next null');
    expect(out).toContain('prefix: "…per seat. "');
    expect(out).not.toContain('fallbacks:');
    expect(out).not.toContain('attrs:');
  });

  it('detailed adds fallbacks, attrs and the whole thread', () => {
    const out = md('detailed');
    expect(out).toContain('fallbacks: [data-testid=choose-pro] | button.cta');
    expect(out).toContain('attrs: class cta · data-testid choose-pro');
    expect(out).toContain('thread:');
    expect(out).toContain('- agent question (2026-09-05T18:31:00.000Z): Should the Free button also grow, or only Pro?');
  });
});

describe('renderAnnotationMarkdown', () => {
  it('numbers each element of a multi-select', () => {
    const multi = annotation({
      target: {
        kind: 'element',
        elements: [elementRef(), elementRef({ selector: 'section.pricing', tag: 'section', name: 'Plans' })],
      },
    });
    const out = renderAnnotationMarkdown(multi, { level: 'compact', dir: DIR });
    expect(out).toContain('element 1:');
    expect(out).toContain('element 2:');
    expect(out.split('\n')[0]).toContain('2 elements:');
  });

  it('collapses a multi-line comment onto one quote line', () => {
    const out = renderAnnotationMarkdown(annotation({ comment: 'one\n\n  two   three' }), {
      level: 'compact',
      dir: DIR,
    });
    expect(out).toContain('> one two three');
  });
});

describe('renderAnswerMarkdown', () => {
  it('pairs the last question with the last answer', () => {
    const answered = annotation({
      number: 4,
      status: 'acknowledged',
      thread: [
        message({ kind: 'comment', text: 'Make it taller.' }),
        message({ id: '01JBZZZZZZ0000000000000005', role: 'agent', kind: 'question', text: 'Should the Free button also grow, or only Pro?' }),
        message({ id: '01JBZZZZZZ0000000000000006', role: 'user', kind: 'answer', text: 'Only Pro. Free stays 40px.' }),
      ],
    });
    expect(renderAnswerMarkdown(answered)).toBe(
      [
        `## Answer on #4 (${answered.id})`,
        'Q (agent): Should the Free button also grow, or only Pro?',
        'A (user): Only Pro. Free stays 40px.',
        '→ status acknowledged, continue.',
        '',
      ].join('\n'),
    );
  });
});

describe('renderReopenMarkdown', () => {
  it('names the new batch and quotes the user', () => {
    const reopened = annotation({
      number: 6,
      batch: '01JBZZZZZZ00000000000000B9',
      thread: [message({ id: '01JBZZZZZZ0000000000000007', kind: 'reopen', text: 'The gaps are still uneven on the middle card.' })],
    });
    expect(renderReopenMarkdown(reopened)).toBe(
      [
        `## Reopened #6 (${reopened.id}), new batch 01JBZZZZZZ00000000000000B9`,
        'User: The gaps are still uneven on the middle card.',
        '',
      ].join('\n'),
    );
  });
});
