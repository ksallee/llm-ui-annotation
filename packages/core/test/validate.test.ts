import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  elementLabel,
  isAnnotation,
  isBatch,
  summarizeTarget,
  validateAnnotation,
  validateBatch,
  type RouteFile,
  type TextTarget,
} from '../src/index.js';
import {
  BATCH,
  ELEMENT_ANNOTATION,
  GROUP_ANNOTATION,
  TEXT_ANNOTATION,
  TEXT_MULTI_ANNOTATION,
  TEXT_TARGET,
  TEXT_TARGET_MULTI,
  annotation,
  elementRef,
  message,
} from './fixtures.js';

const V1_ROUTE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'route-v1.json');

describe('validateAnnotation', () => {
  it('accepts the fixtures', () => {
    for (const a of [ELEMENT_ANNOTATION, TEXT_ANNOTATION, GROUP_ANNOTATION, TEXT_MULTI_ANNOTATION]) {
      expect(validateAnnotation(a)).toEqual([]);
      expect(isAnnotation(a)).toBe(true);
    }
  });

  it.each([
    ['not an object', 42, 'annotation: expected object, got number'],
    ['bad id', annotation({ id: 'nope' }), 'id: expected a 26-char id, got "nope"'],
    [
      'bad protocol version',
      { ...annotation(), protocolVersion: 5 },
      'protocolVersion: expected 1 or 2 or 3 or 4, got 5',
    ],
    ['relative route', annotation({ route: 'pricing' }), 'route: must start with /'],
    ['unknown mode', { ...annotation(), mode: 'sketch' }, 'mode: expected one of element|text, got "sketch"'],
    ['unknown status', { ...annotation(), status: 'done' }, 'status: expected one of draft|sent|acknowledged|question|review|approved, got "done"'],
    ['non-integer number', annotation({ number: 1.5 }), 'number: must be an integer'],
    ['naive timestamp', annotation({ createdAt: '2026-09-05 18:24:41' }), 'createdAt: expected an ISO 8601 UTC timestamp, got "2026-09-05 18:24:41"'],
    ['draft with a batch', annotation({ status: 'draft' }), 'batch: must be null while draft'],
    ['review without resolvedAt', annotation({ status: 'review' }), 'resolvedAt: required once the status is review'],
    ['approved without approvedAt', annotation({ status: 'approved', resolvedAt: '2026-09-05T18:24:41.048Z' }), 'approvedAt: required once the status is approved'],
    [
      'a style edit that is not a property',
      annotation({ styleEdits: [{ selector: 'button', property: 'Padding!', from: '8px', to: '12px', token: null }] }),
      'styleEdits[0].property: expected a CSS property name',
    ],
    [
      'a style edit with no value',
      annotation({ styleEdits: [{ selector: 'button', property: 'padding', from: '8px', to: '  ', token: null }] }),
      'styleEdits[0].to: must not be empty',
    ],
    [
      'a style edit whose token is not a custom property',
      annotation({ styleEdits: [{ selector: 'button', property: 'padding', from: '8px', to: '12px', token: 'space-4' }] }),
      'styleEdits[0].token: expected a custom property',
    ],
  ])('rejects %s', (_name, bad, problem) => {
    expect(validateAnnotation(bad)).toContain(problem);
    expect(isAnnotation(bad)).toBe(false);
  });

  it('caps what a page can grow', () => {
    expect(validateAnnotation(annotation({ comment: 'x'.repeat(10_001) }))).toContain(
      'comment: expected at most 10000 characters, got 10001',
    );
    expect(validateAnnotation(annotation({ thread: new Array(1001).fill(message()) }))).toContain(
      'thread: expected at most 1000 entries, got 1001',
    );
    expect(validateAnnotation(annotation({ comment: 'x'.repeat(10_000) }))).toEqual([]);
  });

  it('refuses a drawing, which v4 no longer has', () => {
    const drawing = {
      ...annotation(),
      mode: 'page',
      target: { kind: 'page', region: { x: 0, y: 0, width: 10, height: 10 }, strokes: [], screenshot: null, elements: [] },
    };
    expect(validateAnnotation(drawing)).toContain('mode: expected one of element|text, got "page"');
    expect(validateAnnotation(drawing)).toContain('target.kind: expected one of element|text, got "page"');
  });

  it('takes a question budget of 0 to 3 and nothing else', () => {
    expect(validateBatch({ ...BATCH, questions: 0 })).toEqual([]);
    expect(validateBatch({ ...BATCH, questions: 3 })).toEqual([]);
    expect(validateBatch({ ...BATCH, questions: 4 })).toContain(
      'questions: expected one of 0|1|2|3, got "4"',
    );
  });

  it('accepts an annotation carrying style edits', () => {
    const a = annotation({
      styleEdits: [
        { selector: '[data-testid="signup"]', property: 'padding', from: '8px 16px', to: 'var(--space-5)', token: '--space-5' },
      ],
    });
    expect(validateAnnotation(a)).toEqual([]);
  });

  it('reads a v1 route file, whose text targets have no blocks', () => {
    const file = JSON.parse(readFileSync(V1_ROUTE, 'utf8')) as RouteFile;
    for (const a of file.annotations) {
      expect(validateAnnotation(a)).toEqual([]);
      expect(a.protocolVersion).toBe(1);
    }
    const [first] = file.annotations;
    expect((first?.target as TextTarget).blocks).toBeUndefined();
    expect(summarizeTarget(first?.target as TextTarget)).toBe(
      'text "Cancel anytime, no questions asked" in p.lede',
    );
  });

  it('rejects a single-block blocks list', () => {
    const bad = annotation({
      mode: 'text',
      target: { ...TEXT_TARGET_MULTI, blocks: [TEXT_TARGET_MULTI.blocks?.[0] as never] },
    });
    expect(validateAnnotation(bad)).toContain('target.blocks: expected at least two blocks');
  });

  it('rejects a target whose kind does not match the mode', () => {
    const bad = annotation({ mode: 'text', target: { kind: 'element', elements: [elementRef()] } });
    expect(validateAnnotation(bad)).toContain('target.kind: "element" does not match mode "text"');
  });

  it('rejects an element target with no elements', () => {
    const bad = annotation({ target: { kind: 'element', elements: [] } });
    expect(validateAnnotation(bad)).toContain('target.elements: expected at least one element');
  });

  it('rejects a text target whose offsets are inverted', () => {
    const bad = annotation({ mode: 'text', target: { ...TEXT_TARGET, start: 90, end: 10 } });
    expect(validateAnnotation(bad)).toContain('target.start: must not be greater than target.end');
  });

  it('reports a malformed thread message by index', () => {
    const bad = annotation({
      thread: [{ id: 'x', role: 'nobody', kind: 'shout', text: 1, at: 'yesterday' } as unknown as never],
    });
    const problems = validateAnnotation(bad);
    expect(problems).toContain('thread[0].id: expected a 26-char id, got "x"');
    expect(problems).toContain('thread[0].role: expected one of user|agent, got "nobody"');
    expect(problems).toContain('thread[0].text: expected string, got number');
  });

  it('rejects a malformed rect deep in the target', () => {
    const bad = annotation({
      target: { kind: 'element', elements: [elementRef({ rect: { x: 0, y: 0, width: 'wide' } as unknown as never })] },
    });
    const problems = validateAnnotation(bad);
    expect(problems).toContain('target.elements[0].rect.width: expected finite number, got string');
    expect(problems).toContain('target.elements[0].rect.height: expected finite number, got undefined');
  });

  it('accepts an optional anchorState and rejects a bad one', () => {
    expect(validateAnnotation(annotation({ anchorState: 'moved' }))).toEqual([]);
    expect(validateAnnotation(annotation({ anchorState: 'gone' as never }))).toContain(
      'anchorState: expected one of exact|moved|lost, got "gone"',
    );
  });
});

describe('validateBatch', () => {
  it('accepts the fixture batch', () => {
    expect(validateBatch(BATCH)).toEqual([]);
    expect(isBatch(BATCH)).toBe(true);
  });

  it('rejects a bad annotation id', () => {
    expect(validateBatch({ ...BATCH, annotationIds: ['short'] })).toContain(
      'annotationIds[0]: expected a 26-char id, got "short"',
    );
  });
});

describe('summarizeTarget', () => {
  it('names a single element with its selector', () => {
    expect(summarizeTarget(ELEMENT_ANNOTATION.target)).toBe(
      'button "Choose Pro" (main > section.pricing > article:nth-of-type(2) button)',
    );
  });

  it('counts a multi-select', () => {
    expect(
      summarizeTarget({
        kind: 'element',
        elements: [elementRef(), elementRef({ tag: 'a', name: 'Pricing' }), elementRef({ tag: 'h2', name: 'Plans' })],
      }),
    ).toBe('3 elements: button "Choose Pro", a "Pricing", h2 "Plans"');
  });

  it('quotes the text run and names its container', () => {
    expect(summarizeTarget(TEXT_ANNOTATION.target)).toBe(
      'text "Cancel anytime, no questions asked" in p.lede',
    );
  });

  it('names the blocks a text run spans', () => {
    expect(summarizeTarget(TEXT_TARGET_MULTI)).toBe(
      'text "Cancel anytime, no questions asked. Nobody will…" across p.lede, blockquote.pull, section.terms > p:nth-of-type(2)',
    );
  });
});

describe('elementLabel', () => {
  it('uses the selector when there is no name', () => {
    expect(elementLabel(elementRef({ name: '', selector: 'section.pricing' }))).toBe('section.pricing');
  });
});
