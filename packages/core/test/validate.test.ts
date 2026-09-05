import { describe, expect, it } from 'vitest';
import {
  elementLabel,
  isAnnotation,
  isBatch,
  summarizeTarget,
  validateAnnotation,
  validateBatch,
} from '../src/index.js';
import {
  BATCH,
  ELEMENT_ANNOTATION,
  PAGE_ANNOTATION,
  PAGE_TARGET,
  TEXT_ANNOTATION,
  TEXT_TARGET,
  annotation,
  elementRef,
} from './fixtures.js';

describe('validateAnnotation', () => {
  it('accepts the three fixture modes', () => {
    for (const a of [ELEMENT_ANNOTATION, TEXT_ANNOTATION, PAGE_ANNOTATION]) {
      expect(validateAnnotation(a)).toEqual([]);
      expect(isAnnotation(a)).toBe(true);
    }
  });

  it.each([
    ['not an object', 42, 'annotation: expected object, got number'],
    ['bad id', annotation({ id: 'nope' }), 'id: expected a 26-char id, got "nope"'],
    ['bad protocol version', { ...annotation(), protocolVersion: 2 }, 'protocolVersion: expected 1, got 2'],
    ['relative route', annotation({ route: 'pricing' }), 'route: must start with /'],
    ['unknown mode', { ...annotation(), mode: 'sketch' }, 'mode: expected one of element|text|page, got "sketch"'],
    ['unknown status', { ...annotation(), status: 'done' }, 'status: expected one of draft|sent|acknowledged|question|review|approved, got "done"'],
    ['non-integer number', annotation({ number: 1.5 }), 'number: must be an integer'],
    ['naive timestamp', annotation({ createdAt: '2026-09-05 18:24:41' }), 'createdAt: expected an ISO 8601 UTC timestamp, got "2026-09-05 18:24:41"'],
    ['draft with a batch', annotation({ status: 'draft' }), 'batch: must be null while draft'],
    ['review without resolvedAt', annotation({ status: 'review' }), 'resolvedAt: required once the status is review'],
    ['approved without approvedAt', annotation({ status: 'approved', resolvedAt: '2026-09-05T18:24:41.048Z' }), 'approvedAt: required once the status is approved'],
  ])('rejects %s', (_name, bad, problem) => {
    expect(validateAnnotation(bad)).toContain(problem);
    expect(isAnnotation(bad)).toBe(false);
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

  it('rejects an unknown stroke tool', () => {
    const bad = annotation({
      mode: 'page',
      target: {
        ...PAGE_TARGET,
        strokes: [{ tool: 'spray', color: 'red', width: 2 } as unknown as never],
      },
    });
    expect(validateAnnotation(bad)).toContain(
      'target.strokes[0].tool: expected one of brush|arrow|rect|ellipse|label, got "spray"',
    );
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

  it('lists what a drawing covers', () => {
    expect(summarizeTarget(PAGE_ANNOTATION.target)).toBe(
      'drawing over 3 elements: h2 "Pricing", section.pricing, article "Free"',
    );
  });

  it('falls back to stroke count when a drawing covers nothing', () => {
    expect(summarizeTarget({ ...PAGE_TARGET, elements: [] })).toBe('drawing over 2 strokes');
  });
});

describe('elementLabel', () => {
  it('uses the selector when there is no name', () => {
    expect(elementLabel(elementRef({ name: '', selector: 'section.pricing' }))).toBe('section.pricing');
  });
});
