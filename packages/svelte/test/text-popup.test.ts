/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { describeRange } from '../src/dom/core-dom.js';
import { openTextPopup } from '../src/modes/text.js';
import { AnnotState } from '../src/state/annot-state.svelte.js';
import type { AnnotClient } from '../src/transport/client.js';
import { fakeClient } from './helpers.js';

const make = (): AnnotState =>
  new AnnotState({
    doc: document,
    client: fakeClient() as unknown as AnnotClient,
    route: '/',
    url: 'http://localhost/',
    persistPrefs: false,
  });

describe('a text note', () => {
  it('holds the range it was opened on, and lets go of it when it closes', () => {
    document.body.innerHTML = '<p id="p">The beagle sleeps under the window.</p>';
    const text = document.querySelector('#p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    const described = describeRange(range, { styles: false });
    if (!described.ok) throw new Error('range not described');

    const state = make();
    state.mode = 'text';
    state.textChip = { rect: { x: 0, y: 0, width: 0, height: 0 }, enabled: true, reason: '', target: described.target, range };
    openTextPopup(state);
    expect(state.popup?.range?.toString()).toBe('beagle');

    state.closePopup();
    expect(state.popup).toBeNull();
  });
});
