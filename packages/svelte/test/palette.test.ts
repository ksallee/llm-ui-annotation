import { describe, expect, it } from 'vitest';
import { filterEntries, fuzzyScore, paletteEntries } from '../src/palette.js';
import { AnnotState } from '../src/state/annot-state.svelte.js';
import { annotation, fakeClient } from './helpers.js';

const state = (): AnnotState => {
  const s = new AnnotState({ client: fakeClient() as never, persistPrefs: false });
  s.applyLocal(annotation({ id: 'a', number: 4, comment: 'the margin is too tight' }));
  return s;
};

describe('fuzzyScore', () => {
  it('matches a subsequence and ranks contiguous hits higher', () => {
    expect(fuzzyScore('hlt', 'highlight mode')).not.toBeNull();
    expect(fuzzyScore('xyz', 'highlight mode')).toBeNull();
    expect(fuzzyScore('high', 'highlight mode')!).toBeGreaterThan(fuzzyScore('high', 'h i g h')!);
  });
});

describe('paletteEntries', () => {
  it('ranks modes first and carries the annotations of this route', () => {
    const entries = paletteEntries(state(), () => {});
    expect(entries.slice(0, 2).map((e) => e.label)).toEqual([
      'Element mode',
      'Highlight mode',
    ]);
    expect(entries.some((e) => e.kind === 'annotation' && e.label.startsWith('#4'))).toBe(true);
  });

  it('never offers a transition that mutates the loop', () => {
    const labels = paletteEntries(state(), () => {}).map((e) => e.label.toLowerCase());
    for (const forbidden of ['approve', 'reopen', 'send annotation', 'approve all']) {
      expect(labels.some((l) => l.includes(forbidden))).toBe(false);
    }
  });

  it('finds an annotation by its number or by a word from the comment', () => {
    const entries = paletteEntries(state(), () => {});
    expect(filterEntries(entries, '#4')[0]!.kind).toBe('annotation');
    expect(filterEntries(entries, 'margin')[0]!.label).toContain('the margin is too tight');
    expect(filterEntries(entries, 'element')[0]!.label).toBe('Element mode');
  });
});
