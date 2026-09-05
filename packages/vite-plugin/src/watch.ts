import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { EVENTS_FILE, ROUTES_DIR } from '@llm-ui-annotation/core';
import { listRouteSlugs } from '@llm-ui-annotation/core/node';
import type { WatchMode } from './options.js';
import type { Store } from './store.js';

const DEBOUNCE_MS = 100;
const POLL_MS = 500;

/**
 * Notice writes made to the annotations dir outside this process.
 *
 * @param store the store to refresh; it pushes the change itself.
 * @param mode native `fs.watch` or polling.
 * @param onError called when the watcher itself fails.
 */
export function startWatching(store: Store, mode: WatchMode, onError: (err: unknown) => void): () => void {
  const routesDir = join(store.dir, ROUTES_DIR);
  const changed = new Set<string>();
  let eventsChanged = false;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = false;

  const refresh = async (slugs: string[], drain: boolean): Promise<void> => {
    for (const routeSlug of slugs) await store.refreshSlug(routeSlug);
    if (drain) await store.drainEvents();
  };

  const flush = async (): Promise<void> => {
    if (running) {
      schedule();
      return;
    }
    running = true;
    const slugs = [...changed];
    const drain = eventsChanged;
    changed.clear();
    eventsChanged = false;
    try {
      await refresh(slugs, drain);
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  };

  function schedule(): void {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, DEBOUNCE_MS);
    timer.unref();
  }

  if (mode === 'poll') {
    const poll = setInterval(() => {
      void (async () => {
        try {
          await refresh(await listRouteSlugs(store.dir), true);
        } catch (err) {
          onError(err);
        }
      })();
    }, POLL_MS);
    poll.unref();
    return () => {
      stopped = true;
      clearInterval(poll);
    };
  }

  const watchers: FSWatcher[] = [];
  const add = (path: string, listen: (name: string | null) => void): void => {
    try {
      const w = watch(path, (_type, name) => listen(name));
      w.on('error', onError);
      watchers.push(w);
    } catch (err) {
      onError(err);
    }
  };

  add(routesDir, (name) => {
    if (!name?.endsWith('.json')) return;
    changed.add(name.slice(0, -'.json'.length));
    schedule();
  });

  add(store.dir, (name) => {
    if (name !== EVENTS_FILE) return;
    eventsChanged = true;
    schedule();
  });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    for (const w of watchers) w.close();
  };
}
