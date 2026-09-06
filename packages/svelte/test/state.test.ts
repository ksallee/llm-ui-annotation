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

    state.setPref('sendMode', 'immediate');
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
    state.setPref('sendMode', 'immediate');
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

  it('only deletes drafts', async () => {
    const { state, client } = make();
    state.applyLocal(annotation({ id: 'A', status: 'sent' }));
    await state.deleteDraft('A');
    expect(state.annotations.has('A')).toBe(true);
    expect(client.calls).toHaveLength(0);
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

describe('drawing stack', () => {
  it('undoes and redoes strokes', () => {
    const { state } = make();
    state.pushStroke({ tool: 'rect', rect: { x: 0, y: 0, width: 10, height: 10 }, color: 'red', width: 2 });
    state.pushStroke({ tool: 'rect', rect: { x: 5, y: 5, width: 10, height: 10 }, color: 'red', width: 2 });
    state.undoStroke();
    expect(state.drawing.strokes).toHaveLength(1);
    expect(state.drawing.undone).toHaveLength(1);
    state.redoStroke();
    expect(state.drawing.strokes).toHaveLength(2);
    state.pushStroke({ tool: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, color: 'red', width: 2 });
    expect(state.drawing.undone).toHaveLength(0);
    expect(state.drawingRegion).not.toBeNull();
  });
});
