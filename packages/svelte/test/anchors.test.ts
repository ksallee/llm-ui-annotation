import type { TextTarget } from '@llm-ui-annotation/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnnotState } from '../src/state/annot-state.svelte.js';
import type { AnnotClient } from '../src/transport/client.js';
import { annotation, fakeClient } from './helpers.js';

const make = (): AnnotState =>
  new AnnotState({
    client: fakeClient() as unknown as AnnotClient,
    route: '/',
    url: 'http://localhost/',
    persistPrefs: false,
  });

const textTarget = (over: Partial<TextTarget> = {}): TextTarget => ({
  kind: 'text',
  container: {
    selector: 'p.lede',
    fallbacks: ['main > p'],
    tag: 'p',
    role: null,
    name: '',
    text: '',
    rect: { x: 0, y: 0, width: 400, height: 40 },
    fixed: false,
    attrs: {},
  },
  quote: 'no questions asked',
  prefix: 'Cancel anytime, ',
  suffix: '.',
  start: 16,
  end: 34,
  rects: [{ x: 20, y: 100, width: 120, height: 18 }],
  ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('marker placement', () => {
  it('puts element markers at the top right, text markers at the end, page markers at the top left', () => {
    const state = make();
    const element = annotation({ id: 'E', mode: 'element', number: 1 });
    const text = annotation({ id: 'T', mode: 'text', number: 2, target: textTarget() });
    const page = annotation({
      id: 'P',
      mode: 'page',
      number: 3,
      target: { kind: 'page', region: { x: 5, y: 6, width: 100, height: 50 }, strokes: [], screenshot: null, elements: [] },
    });
    for (const a of [element, text, page]) state.applyLocal(a);

    state.anchors.set('E', { rects: [{ x: 10, y: 20, width: 100, height: 40 }], state: 'exact', range: null });
    state.anchors.set('T', {
      rects: [
        { x: 20, y: 100, width: 120, height: 18 },
        { x: 20, y: 120, width: 60, height: 18 },
      ],
      state: 'exact',
      range: null,
    });
    state.anchors.set('P', { rects: [{ x: 5, y: 6, width: 100, height: 50 }], state: 'exact', range: null });

    expect(state.markerPoint('E')).toEqual({ x: 110, y: 20 });
    expect(state.markerPoint('T')).toEqual({ x: 80, y: 120 });
    expect(state.markerPoint('P')).toEqual({ x: 5, y: 6 });
    expect(state.markerPoint('missing')).toBeNull();
  });
});

describe('re-anchoring', () => {
  it('resolves an element target through its selector', () => {
    document.body.innerHTML = '<button class="cta">Save</button>';
    const state = make();
    state.applyLocal(annotation({ id: 'A', status: 'sent' }));
    state.reanchor();
    expect(state.anchors.get('A')?.state).toBe('exact');
  });

  it('marks an element target lost when nothing matches and keeps the recorded rect', () => {
    document.body.innerHTML = '<div>nothing here</div>';
    const state = make();
    state.applyLocal(annotation({ id: 'A', status: 'sent' }));
    state.reanchor();
    const anchor = state.anchors.get('A');
    expect(anchor?.state).toBe('lost');
    expect(anchor?.rects[0]).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(state.lost.map((a) => a.id)).toEqual(['A']);
  });

  it('finds text by its quote and reports exact', () => {
    document.body.innerHTML = '<main><p class="lede">Cancel anytime, no questions asked.</p></main>';
    const state = make();
    state.applyLocal(annotation({ id: 'T', mode: 'text', status: 'sent', target: textTarget() }));
    state.reanchor();
    expect(state.anchors.get('T')?.state).toBe('exact');
  });

  it('reports moved after an insertion before the quote', () => {
    document.body.innerHTML =
      '<main><p class="lede">Some new sentence first. Cancel anytime, no questions asked.</p></main>';
    const state = make();
    state.applyLocal(annotation({ id: 'T', mode: 'text', status: 'sent', target: textTarget() }));
    state.reanchor();
    expect(state.anchors.get('T')?.state).toBe('moved');
  });

  it('reports moved when only the head of the quote survives', () => {
    document.body.innerHTML =
      '<main><p class="lede">Cancel anytime, no questions asked and nothing else matters.</p></main>';
    const state = make();
    state.applyLocal(
      annotation({
        id: 'T',
        mode: 'text',
        status: 'sent',
        target: textTarget({
          quote: 'no questions asked and nothing more to say about it',
          suffix: '',
          end: 67,
        }),
      }),
    );
    state.reanchor();
    expect(state.anchors.get('T')?.state).toBe('moved');
  });

  it('reports lost when the quote is gone', () => {
    document.body.innerHTML = '<main><p class="lede">Something else entirely.</p></main>';
    const state = make();
    state.applyLocal(annotation({ id: 'T', mode: 'text', status: 'sent', target: textTarget() }));
    state.reanchor();
    expect(state.anchors.get('T')?.state).toBe('lost');
  });

  it('forgets anchors for approved annotations', () => {
    document.body.innerHTML = '<button class="cta">Save</button>';
    const state = make();
    state.applyLocal(annotation({ id: 'A', status: 'sent' }));
    state.reanchor();
    expect(state.anchors.has('A')).toBe(true);
    state.applyLocal(annotation({ id: 'A', status: 'approved' }));
    state.reanchor();
    expect(state.anchors.has('A')).toBe(false);
  });
});
