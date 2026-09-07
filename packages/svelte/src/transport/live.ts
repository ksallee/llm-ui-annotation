import type { Annotation, RouteFile } from '@llm-ui-annotation/core';
import type { HotLike } from '../options.js';
import type { AnnotState } from '../state/annot-state.svelte.js';
import type { AnnotClient } from './client.js';

export interface LiveOptions {
  hot?: HotLike | null;
  pollMs?: number;
  healthMs?: number;
}

/** Hydrate the route, then keep the state in sync over HMR events or polling. */
export function connectLive(
  state: AnnotState,
  client: AnnotClient,
  options: LiveOptions = {},
): () => void {
  const view = state.doc?.defaultView;
  const pollMs = options.pollMs ?? 2000;
  const healthMs = options.healthMs ?? 10000;
  let stopped = false;
  const timers: number[] = [];

  const load = async (): Promise<void> => {
    const health = await client.health();
    if (stopped) return;
    if (!health) {
      state.connection = 'offline';
      return;
    }
    state.connection = options.hot ? 'connected' : 'polling';
    try {
      state.hydrate(await client.route(state.route));
    } catch {
      state.hydrate({ route: state.route, updatedAt: '', nextNumber: 1, annotations: [] });
    }
    try {
      const { events } = await client.events(0);
      state.seq = events.at(-1)?.seq ?? 0;
    } catch {
      /* no events yet */
    }
    state.reanchor();
  };

  const onAnnotation = (payload: unknown): void => {
    const annotation = payload as Annotation | { annotation?: Annotation };
    const value = 'id' in annotation ? annotation : annotation.annotation;
    if (value) {
      state.applyServer(value);
      state.announceStatus(value.id, value.status);
      state.reanchor();
    }
  };

  const onDeleted = (payload: unknown): void => {
    const id = typeof payload === 'string' ? payload : (payload as { id?: string }).id;
    if (id) state.removeLocal(id);
  };

  const onRoute = (payload: unknown): void => {
    const file = payload as RouteFile;
    if (file?.route === state.route) {
      state.hydrate(file);
      state.reanchor();
    }
  };

  if (options.hot) {
    options.hot.on('annot:annotation', onAnnotation);
    options.hot.on('annot:deleted', onDeleted);
    options.hot.on('annot:route', onRoute);
  } else if (view) {
    const poll = async (): Promise<void> => {
      if (stopped) return;
      try {
        const { events } = await client.events(state.seq);
        for (const event of events) state.receiveEvent(event);
        if (events.length > 0) state.reanchor();
        state.connection = 'polling';
      } catch {
        state.connection = 'offline';
      }
    };
    timers.push(view.setInterval(poll, pollMs));
  }

  if (view) {
    timers.push(
      view.setInterval(async () => {
        if (state.connection !== 'offline') return;
        const health = await client.health();
        if (health && !stopped) await load();
      }, healthMs),
    );
  }

  void load();

  return () => {
    stopped = true;
    for (const timer of timers) view?.clearInterval(timer);
    options.hot?.off?.('annot:annotation', onAnnotation);
    options.hot?.off?.('annot:deleted', onDeleted);
    options.hot?.off?.('annot:route', onRoute);
  };
}
