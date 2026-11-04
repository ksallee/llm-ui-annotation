import { applyTransition } from '@llm-ui-annotation/core';
import { describe, expect, it } from 'vitest';
import { AnnotState } from '../src/state/annot-state.svelte.js';
import type { AnnotClient } from '../src/transport/client.js';
import { annotation, elementTarget, fakeClient, routeFile } from './helpers.js';

const make = (): { state: AnnotState; client: ReturnType<typeof fakeClient> } => {
  const client = fakeClient();
  const state = new AnnotState({
    client: client as unknown as AnnotClient,
    route: '/',
    url: 'http://localhost/',
    persistPrefs: false,
  });
  return { state, client };
};

describe('AnnotState reconciliation', () => {
  it('hydrates a route file and keeps unsaved optimistic drafts', () => {
    const { state } = make();
    const saved = annotation({ id: 'A', number: 1 });
    const pending = annotation({ id: 'B', number: 2 });
    state.applyLocal(pending);
    state.optimistic.add('B');

    state.hydrate(routeFile([saved]));

    expect([...state.annotations.keys()].sort()).toEqual(['A', 'B']);
    expect(state.nextNumber).toBe(2);
  });

  it('drops an optimistic entry once the server confirms it', () => {
    const { state } = make();
    const local = annotation({ id: 'A', comment: 'local' });
    state.optimistic.add('A');
    state.applyLocal(local);

    state.applyServer({ ...local, comment: 'server', number: 7 });

    expect(state.optimistic.has('A')).toBe(false);
    expect(state.annotations.get('A')?.comment).toBe('server');
    expect(state.nextNumber).toBe(8);
  });

  it('re-hydrating replaces the server copy but not a newer optimistic one', () => {
    const { state } = make();
    state.hydrate(routeFile([annotation({ id: 'A', comment: 'first' })]));
    state.hydrate(routeFile([annotation({ id: 'A', comment: 'second' })]));
    expect(state.annotations.get('A')?.comment).toBe('second');
    expect(state.annotations.size).toBe(1);
  });

  it('applies events, including deletions', () => {
    const { state } = make();
    const a = annotation({ id: 'A' });
    state.applyLocal(a);
    const moved = applyTransition({ ...a, status: 'sent' }, 'review', 'agent', {
      role: 'agent',
      kind: 'summary',
      text: 'done',
    });

    state.receiveEvent({
      seq: 4,
      at: moved.updatedAt,
      type: 'status.changed',
      by: 'agent',
      route: '/',
      annotationId: 'A',
      status: 'review',
      data: moved,
    });
    expect(state.seq).toBe(4);
    expect(state.annotations.get('A')?.status).toBe('review');
    expect(state.announcement).toContain('ready for review');

    state.receiveEvent({ seq: 5, at: moved.updatedAt, type: 'annotation.deleted', by: 'user', route: '/', annotationId: 'A' });
    expect(state.annotations.has('A')).toBe(false);
  });

  it('never resurrects an annotation from another route into this one', () => {
    const { state } = make();
    state.applyLocal(annotation({ id: 'X', route: '/other', number: 3 }));
    state.hydrate(routeFile([annotation({ id: 'A' })]));
    expect(state.onRoute.map((a) => a.id)).toEqual(['A']);
    expect(state.list).toHaveLength(2);
  });
});

describe('AnnotState derivations', () => {
  it('counts drafts, what needs the user, and the badge', () => {
    const { state } = make();
    state.hydrate(
      routeFile([
        annotation({ id: 'A', status: 'draft', number: 1 }),
        annotation({ id: 'B', status: 'question', number: 2 }),
        annotation({ id: 'C', status: 'review', number: 3 }),
        annotation({ id: 'D', status: 'approved', number: 4 }),
      ]),
    );

    expect(state.drafts.map((a) => a.id)).toEqual(['A']);
    expect(state.needsYou.map((a) => a.id)).toEqual(['B', 'C']);
    expect(state.visible.map((a) => a.id)).toEqual(['A', 'B', 'C']);
    expect(state.counts.approved).toBe(1);
    expect(state.badge).toBe(1);

    state.setPref('sendMode', 'review');
    expect(state.badge).toBe(2);
  });

  it('filters panel rows', () => {
    const { state } = make();
    state.hydrate(
      routeFile([
        annotation({ id: 'A', status: 'draft', number: 1 }),
        annotation({ id: 'B', status: 'review', number: 2 }),
        annotation({ id: 'C', status: 'approved', number: 3 }),
      ]),
    );
    state.setFilter('needs-you');
    expect(state.filtered.map((a) => a.id)).toEqual(['B']);
    state.setFilter('open');
    expect(state.filtered.map((a) => a.id)).toEqual(['A']);
    state.setFilter('done');
    expect(state.filtered.map((a) => a.id)).toEqual(['C']);
    state.setFilter('all');
    expect(state.filtered).toHaveLength(3);
  });

  it('counts each filter chip with the predicate that filter uses', () => {
    const { state } = make();
    state.hydrate(
      routeFile([
        annotation({ id: 'A', status: 'draft', number: 1 }),
        annotation({ id: 'B', status: 'review', number: 2 }),
        annotation({ id: 'C', status: 'question', number: 3 }),
        annotation({ id: 'D', status: 'approved', number: 4 }),
      ]),
    );
    expect(state.filterCounts).toEqual({ 'needs-you': 2, open: 1, done: 1, all: 4 });
  });

  it('defaults the panel filter to what needs the user', () => {
    const { state } = make();
    state.hydrate(routeFile([annotation({ id: 'B', status: 'question', number: 1 })]));
    state.togglePanel(true);
    expect(state.panelFilter).toBe('needs-you');

    state.setFilter('all');
    state.togglePanel(false);
    state.togglePanel(true);
    expect(state.panelFilter).toBe('all');
  });
});

describe('AnnotState writes', () => {
  it('adds a draft optimistically and reconciles with the server number', async () => {
    const { state, client } = make();
    const created = await state.add('element', elementTarget(), 'tighten this');
    expect(created.status).toBe('draft');
    expect(client.calls).toEqual(['create:' + created.id]);
    expect(state.annotations.get(created.id)?.number).toBe(1);
    expect(state.optimistic.size).toBe(0);
  });

  it('sends a batch of one straight away in immediate mode', async () => {
    const { state, client } = make();
    state.setPref('sendMode', 'review');
    const created = await state.add('element', elementTarget(), 'now');
    expect(created.status).toBe('sent');
    expect(client.calls).toContain('batch');
  });

  it('goes offline and keeps the annotation when the server refuses', async () => {
    const client = fakeClient();
    client.create = () => Promise.reject(new Error('down'));
    const state = new AnnotState({ client: client as unknown as AnnotClient, persistPrefs: false });
    const created = await state.add('element', elementTarget(), 'offline');
    expect(state.connection).toBe('offline');
    expect(state.annotations.has(created.id)).toBe(true);
  });

  it('deletes a note whatever its status, and says which one went', async () => {
    const { state, client } = make();
    state.applyLocal(annotation({ id: 'A', status: 'review', number: 4 }));
    await state.deleteRow('A');
    expect(state.annotations.has('A')).toBe(false);
    expect(client.calls).toEqual(['remove:A']);
    expect(state.toasts.map((t) => t.text)).toEqual(['Deleted #4']);
  });

  it('moves drafts to sent when the batch goes out', async () => {
    const { state, client } = make();
    state.hydrate(routeFile([annotation({ id: 'A', status: 'draft', number: 1 })]));
    await state.sendDrafts('all about spacing');
    expect(state.annotations.get('A')?.status).toBe('sent');
    expect(client.calls).toContain('batch');
    expect(state.sendOpen).toBe(false);
  });
});

describe('the thread', () => {
  it('opens with the note, and stays empty until there is one', async () => {
    const { state } = make();
    const written = await state.add('element', elementTarget(), 'tighten this');
    expect(written.thread.map((m) => m.text)).toEqual(['tighten this']);

    // A note made early for a dropped file has no words yet, so no entry yet.
    const early = await state.add('element', elementTarget(), '', true);
    expect(early.thread).toEqual([]);
  });
});

describe('send modes', () => {
  it('sends on add and leaves the agent\u2019s work for review', async () => {
    const { state, client } = make();
    state.setPref('sendMode', 'review');
    const created = await state.add('element', elementTarget(), 'now');
    expect(created.status).toBe('sent');

    state.applyServer({ ...state.annotations.get(created.id)!, status: 'review' });
    expect(state.annotations.get(created.id)!.status).toBe('review');
    expect(client.calls).not.toContain(`transition:${created.id}`);
  });

  it('approves the work itself when the mode says so', async () => {
    const { state, client } = make();
    state.setPref('sendMode', 'auto');
    const created = await state.add('element', elementTarget(), 'now');

    state.applyServer({ ...state.annotations.get(created.id)!, status: 'review' });
    await Promise.resolve();
    expect(client.calls).toContain(`transition:${created.id}`);
  });

  it('carries the question budget on every batch it creates', async () => {
    const { state, client } = make();
    state.setPref('questions', 0);
    state.setPref('sendMode', 'review');
    await state.add('element', elementTarget(), 'now');
    expect(client.batches.at(-1)?.questions).toBe(0);
  });
});

describe('style edits', () => {
  const edit = (over: Record<string, unknown> = {}) => ({
    selector: '[data-testid="signup"]',
    property: 'padding',
    from: '8px 16px',
    to: '24px',
    token: null,
    ...over,
  });

  it('keeps one edit per property and drops it when the value comes back', () => {
    const { state } = make();
    state.setStyleEdit(edit());
    state.setStyleEdit(edit({ to: '32px' }));
    expect(state.styleEdits).toHaveLength(1);
    expect(state.styleEdit('[data-testid="signup"]', 'padding')?.to).toBe('32px');

    state.setStyleEdit(edit({ to: '' }));
    expect(state.styleEdits).toEqual([]);
  });

  it('rides with the next note and does not outlive it', async () => {
    const { state } = make();
    state.setStyleEdit(edit({ to: 'var(--space-5)', token: '--space-5' }));
    const created = await state.add('element', elementTarget(), 'roomier');
    expect(created.styleEdits).toEqual([edit({ to: 'var(--space-5)', token: '--space-5' })]);

    state.clearStyleEdits();
    const next = await state.add('element', elementTarget(), 'something else');
    expect(next.styleEdits).toBeUndefined();
  });

  it('leaving the mode drops the proposal', () => {
    const { state } = make();
    state.setMode('element');
    state.setStyleEdit(edit());
    state.setMode('element');
    expect(state.mode).toBeNull();
    expect(state.styleEdits).toEqual([]);
  });
});

describe('the drawer channel', () => {
  it('follows the selection, and the toggle holds until the selection changes', () => {
    const { state } = make();
    const one = document.createElement('button');
    const two = document.createElement('a');
    state.mode = 'element';
    expect(state.channel).toBe('notes');

    state.selection = [one];
    expect(state.channel).toBe('inspect');

    state.setChannel('notes');
    state.selection = [one];
    expect(state.channel).toBe('notes');

    state.selection = [two];
    expect(state.channel).toBe('inspect');

    state.selection = [];
    expect(state.channel).toBe('notes');
  });

  it('reads nothing outside Element mode', () => {
    const { state } = make();
    state.mode = 'element';
    state.selection = [document.createElement('button')];
    state.setMode('text');
    expect(state.inspected).toBeNull();
    expect(state.channel).toBe('notes');
  });
});

