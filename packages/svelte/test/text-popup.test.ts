/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { describeRange } from '../src/dom/core-dom.js';
import { openTextPopup } from '../src/modes/text.js';
import { AnnotState } from '../src/state/annot-state.svelte.js';
import { newId, type ReplaceRequest } from '@llm-ui-annotation/core';
import { AnnotHttpError, type AnnotClient } from '../src/transport/client.js';
import { annotation, fakeClient } from './helpers.js';

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

describe('replacing the selected text', () => {
  const open = (client: unknown): AnnotState => {
    document.body.innerHTML = '<p id="p">The beagle sleeps under the window.</p>';
    const text = document.querySelector('#p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    const described = describeRange(range, { styles: false });
    if (!described.ok) throw new Error('range not described');
    const state = new AnnotState({
      doc: document,
      client: client as AnnotClient,
      route: '/doc/a.md',
      url: 'http://localhost/',
      persistPrefs: false,
    });
    state.mode = 'text';
    state.canReplace = true;
    state.textChip = { rect: { x: 0, y: 0, width: 0, height: 0 }, enabled: true, reason: '', target: described.target, range };
    openTextPopup(state);
    return state;
  };

  it('starts from the selected text and posts the edit, then closes', async () => {
    const posted: ReplaceRequest[] = [];
    const client = {
      ...fakeClient(),
      async replace(request: ReplaceRequest) {
        posted.push(request);
        return annotation({ id: newId(), route: request.route, mode: 'text', target: request.target, status: 'approved', kind: 'replace' });
      },
    };
    const state = open(client);
    state.startReplace();
    expect(state.popup?.replacing).toBe('beagle');

    state.popup!.replacing = 'spaniel';
    await state.confirmReplace();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ route: '/doc/a.md', replacement: 'spaniel', target: { quote: 'beagle' } });
    expect(state.popup).toBeNull();
    expect([...state.annotations.values()].map((a) => a.kind)).toEqual(['replace']);
  });

  it('keeps the popup open and says why when the server refuses', async () => {
    const client = {
      ...fakeClient(),
      async replace(): Promise<never> {
        throw new AnnotHttpError(409, 'a.md changed since this text was selected; reload the page and select it again');
      },
    };
    const state = open(client);
    state.startReplace();
    state.popup!.replacing = 'spaniel';
    await state.confirmReplace();
    expect(state.popup?.error).toMatch(/changed since/);
    expect(state.popup?.replacing).toBe('spaniel');
  });
});
