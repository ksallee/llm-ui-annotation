import type { Mode } from '@llm-ui-annotation/core';
import type { Corner, DetailLevel, MarkerVisibility, SendMode } from '../options.js';
import type { Density, SchemeOption } from '../theme/index.js';

export const PREFS_KEY = 'annot:prefs';

export interface Prefs {
  corner: Corner;
  scheme: SchemeOption | null;
  accent: string | null;
  density: Density;
  sendMode: SendMode;
  detail: DetailLevel;
  mode: Mode | null;
  panelOpen: boolean;
  markers: MarkerVisibility;
  blockInteractions: boolean;
  expanded: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  corner: 'br',
  scheme: null,
  accent: null,
  density: 'comfortable',
  sendMode: 'batch',
  detail: 'standard',
  mode: null,
  panelOpen: false,
  markers: 'all',
  blockInteractions: true,
  expanded: false,
};

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function storageOf(doc?: Document): Storage | null {
  try {
    return doc?.defaultView?.localStorage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Stored UI preferences merged over the defaults. Never holds annotations. */
export function loadPrefs(doc?: Document): Prefs {
  const store = storageOf(doc);
  if (!store) return { ...DEFAULT_PREFS };
  try {
    const raw = store.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs, doc?: Document): void {
  const store = storageOf(doc);
  if (!store) return;
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode, quota, or no storage: preferences are not worth an error */
  }
}
