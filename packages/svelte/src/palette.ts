// The command palette: what it offers, and how a query ranks it.

import { formatCombo } from './keyboard.js';
import type { SendMode } from './options.js';
import type { AnnotState, Filter } from './state/annot-state.svelte.js';

const SEND_ORDER: SendMode[] = ['manual', 'review', 'auto'];

export type PaletteKind = 'mode' | 'filter' | 'setting' | 'annotation';

export interface PaletteEntry {
  id: string;
  kind: PaletteKind;
  label: string;
  /** Shown right-aligned: the scoped shortcut, or the setting's current value. */
  hint: string;
  /** What the query is matched against; defaults to the label. */
  search: string;
  run(): void;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'needs-you', label: 'Needs you' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

const entry = (
  id: string,
  kind: PaletteKind,
  label: string,
  hint: string,
  run: () => void,
  extra: { search?: string } = {},
): PaletteEntry => ({
  id,
  kind,
  label,
  hint,
  search: extra.search ?? label,
  run,
});

/**
 * Everything the palette offers, in rank order. Mutating the loop — approve, reopen, send — is
 * deliberately absent: a fuzzy match plus Enter is too easy to fire by accident.
 */
export function paletteEntries(state: AnnotState, locate: (id: string) => void): PaletteEntry[] {
  const out: PaletteEntry[] = [
    entry('mode:element', 'mode', 'Element mode', 'E', () => state.setMode('element')),
    entry('mode:text', 'mode', 'Highlight mode', 'H', () => state.setMode('text')),
  ];

  for (const filter of FILTERS) {
    out.push(
      entry(`filter:${filter.id}`, 'filter', `Filter: ${filter.label}`, '', () => {
        state.togglePanel(true);
        state.setFilter(filter.id);
      }),
    );
  }

  out.push(
    entry('setting:panel', 'setting', 'Toggle the panel', 'I', () => state.togglePanel()),
    entry('setting:pins', 'setting', 'Pins: all → dots → none', state.prefs.markers, () =>
      state.cycleMarkers(),
    ),
    entry('setting:pause', 'setting', 'Pause animations', '⇧P', () => {
      state.frozen = !state.frozen;
    }),
    entry('setting:routes', 'setting', 'Show every route in the panel', '', () => {
      void state.toggleAllRoutes();
    }),
    entry('setting:send-mode', 'setting', 'Send mode: manual, review or auto', state.prefs.sendMode, () =>
      state.setPref('sendMode', SEND_ORDER[(SEND_ORDER.indexOf(state.prefs.sendMode) + 1) % SEND_ORDER.length]!),
    ),
    entry('setting:css', 'setting', 'CSS details on the canvas', String(state.prefs.cssDetails), () =>
      state.setPref('cssDetails', !state.prefs.cssDetails),
    ),
    entry('setting:block', 'setting', 'Block page interactions', String(state.prefs.blockInteractions), () =>
      state.setPref('blockInteractions', !state.prefs.blockInteractions),
    ),
    entry('setting:settings', 'setting', 'Open settings', formatCombo(state.prefs.paletteKey), () => {
      state.settingsOpen = true;
    }),
    entry('setting:shortcuts', 'setting', 'Keyboard shortcuts', '?', () => {
      state.shortcutsOpen = true;
    }),
  );

  for (const a of state.onRoute) {
    out.push(
      entry(`annotation:${a.id}`, 'annotation', `#${a.number} ${a.comment}`, a.status, () => {
        state.togglePanel(true);
        state.expandedId = a.id;
        locate(a.id);
      }, { search: `#${a.number} ${a.comment} ${a.status}` }),
    );
  }

  return out;
}

/** Subsequence match. Higher is better; null when the query does not fit at all. */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;
  let score = 0;
  let at = 0;
  let streak = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, at);
    if (found === -1) return null;
    streak = found === at ? streak + 1 : 0;
    score += 10 + streak * 4 - Math.min(found - at, 8);
    if (found === 0 || text[found - 1] === ' ' || text[found - 1] === '#') score += 6;
    at = found + 1;
  }
  return score;
}

export function filterEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries
    .map((e, rank) => ({ e, rank, score: fuzzyScore(q, e.search.toLowerCase()) }))
    .filter((hit): hit is { e: PaletteEntry; rank: number; score: number } => hit.score !== null)
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map((hit) => hit.e);
}
