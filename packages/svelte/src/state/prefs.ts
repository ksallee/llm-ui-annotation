import type { Mode } from '@llm-ui-annotation/core';
import { DEFAULT_PALETTE_KEY } from '../keyboard.js';
import { sendModeOf } from '../options.js';
import type { Corner, Density, DetailLevel, MarkerVisibility, SchemeOption, SendMode } from '../options.js';

export const PREFS_KEY = 'annot:prefs';

export interface Prefs {
  corner: Corner;
  scheme: SchemeOption | null;
  accent: string | null;
  density: Density;
  sendMode: SendMode;
  /** How freely the agent may ask instead of deciding: 0 never, 3 whenever it would help. */
  questions: 0 | 1 | 2 | 3;
  detail: DetailLevel;
  mode: Mode | null;
  panelOpen: boolean;
  markers: MarkerVisibility;
  /** Draw the box model and its numbers over the hovered element in Element mode. */
  cssDetails: boolean;
  blockInteractions: boolean;
  expanded: boolean;
  /** The one global binding, as `comboOf` writes it. */
  paletteKey: string;
  /** Viewport position of the drawing bar; null keeps it top centre. */
  drawBar: { x: number; y: number } | null;
}

export const DEFAULT_PREFS: Prefs = {
  corner: 'br',
  scheme: null,
  accent: null,
  density: 'comfortable',
  sendMode: 'manual',
  questions: 1,
  detail: 'standard',
  mode: null,
  panelOpen: false,
  markers: 'all',
  cssDetails: true,
  blockInteractions: true,
  expanded: false,
  paletteKey: DEFAULT_PALETTE_KEY,
  drawBar: null,
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
    // `batch` and `immediate` are what the two-way version of this preference stored.
    const sendMode = parsed.sendMode ? sendModeOf(parsed.sendMode) : null;
    return { ...DEFAULT_PREFS, ...parsed, ...(sendMode ? { sendMode } : {}) };
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
