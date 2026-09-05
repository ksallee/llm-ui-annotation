import { computeTheme, type Scheme } from '@llm-ui-annotation/core/theme';
import { applyTokens } from '@llm-ui-annotation/svelte/theme';

/** The one accent the reader and the overlay both derive from. */
export const READER_ACCENT = 'oklch(0.6 0.08 187)';

export const PREFS_KEY = 'annot-reader:prefs';
export const BASE_SIZE = 17;
export const MIN_STEP = -3;
export const MAX_STEP = 5;

export interface ReaderPrefs {
  scheme: Scheme;
  fontStep: number;
}

export const DEFAULT_PREFS: ReaderPrefs = { scheme: 'auto', fontStep: 0 };

const clampStep = (n: number): number => Math.min(MAX_STEP, Math.max(MIN_STEP, Math.round(n)));

export function loadPrefs(view: Window): ReaderPrefs {
  try {
    const raw = view.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      scheme:
        parsed.scheme === 'light' || parsed.scheme === 'dark' || parsed.scheme === 'auto'
          ? parsed.scheme
          : 'auto',
      fontStep: clampStep(typeof parsed.fontStep === 'number' ? parsed.fontStep : 0),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(view: Window, prefs: ReaderPrefs): void {
  try {
    view.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

export function nextStep(step: number, delta: number): number {
  return clampStep(step + delta);
}

/** Write the derived palette and the reading size onto `:root`. */
export function applyReaderTheme(doc: Document, prefs: ReaderPrefs): void {
  const view = doc.defaultView;
  const prefersDark = view?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
  const reduced = view?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
  const tokens = computeTheme(
    { accent: READER_ACCENT, scheme: prefs.scheme, radius: 8 },
    prefersDark,
    reduced,
  );
  applyTokens(doc.documentElement, tokens);
  doc.documentElement.style.setProperty('--reader-size', `${BASE_SIZE + prefs.fontStep}px`);
}
