import {
  computeTheme,
  parseColor,
  TOKEN_NAMES,
  type ResolvedScheme,
  type ThemeInput,
  type ThemeTokens,
} from '@llm-ui-annotation/core/theme';

export type { ResolvedScheme, ThemeInput, ThemeTokens };

export interface ThemeHandle {
  readonly tokens: ThemeTokens;
  /** Recompute from a new input, or from the host's hints when omitted. */
  update(input?: ThemeInput): ThemeTokens;
  destroy(): void;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const matches = (view: Window | null, query: string): boolean => {
  try {
    return view?.matchMedia?.(query).matches ?? false;
  } catch {
    return false;
  }
};

const readProperty = (el: Element, name: string): string => {
  const inline = (el as HTMLElement).style?.getPropertyValue(name) ?? '';
  if (inline.trim() !== '') return inline.trim();
  try {
    return el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(name).trim() ?? '';
  } catch {
    return '';
  }
};

/** `--annot-accent` on `:root`, else a computed `accent-color` on `body`. */
export function readAccentHint(doc: Document): string | null {
  const candidates = [
    readProperty(doc.documentElement, '--annot-accent'),
    doc.body ? readProperty(doc.body, 'accent-color') : '',
  ];
  for (const value of candidates) {
    if (value === '' || value === 'auto') continue;
    if (parseColor(value)) return value;
  }
  return null;
}

/** The host's `color-scheme` on `:root`, only when it names exactly one scheme. */
export function readSchemeHint(doc: Document): ResolvedScheme | null {
  const value = readProperty(doc.documentElement, 'color-scheme');
  if (value === 'dark') return 'dark';
  if (value === 'light') return 'light';
  return null;
}

/** Write tokens onto an element as custom properties. */
export function applyTokens(host: HTMLElement, tokens: ThemeTokens): void {
  for (const name of TOKEN_NAMES) host.style.setProperty(name, tokens[name]);
  host.style.setProperty('color-scheme', tokens['--annot-color-scheme']);
}

/**
 * Compute the theme for `host`, write it, and keep it in sync with the host page.
 *
 * @param onPaint runs on every repaint, including the first, so a consumer can restyle what does
 * not live on the shadow root.
 */
export function applyTheme(
  host: HTMLElement,
  input: ThemeInput = {},
  onPaint?: (tokens: ThemeTokens) => void,
): ThemeHandle {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  let current = input;
  let tokens: ThemeTokens | null = null;

  const paint = (): ThemeTokens => {
    const accent = current.accent ?? readAccentHint(doc);
    const hint = readSchemeHint(doc);
    const next = computeTheme(
      accent === null ? current : { ...current, accent },
      hint === null ? matches(view, DARK_QUERY) : hint === 'dark',
      matches(view, REDUCED_MOTION_QUERY),
    );
    const changed = tokens === null || TOKEN_NAMES.some((name) => tokens?.[name] !== next[name]);
    if (changed) applyTokens(host, next);
    tokens = next;
    if (changed) onPaint?.(next);
    return next;
  };

  paint();

  const queries = [DARK_QUERY, REDUCED_MOTION_QUERY].flatMap((q) => {
    try {
      const list = view?.matchMedia?.(q);
      return list ? [list] : [];
    } catch {
      return [];
    }
  });
  const onChange = (): void => void paint();
  for (const list of queries) list.addEventListener?.('change', onChange);

  const Observer = view?.MutationObserver;
  const observer = Observer ? new Observer(onChange) : null;
  if (observer) {
    const options = { attributes: true, attributeFilter: ['style', 'class'] };
    observer.observe(doc.documentElement, options);
    if (doc.body) observer.observe(doc.body, options);
  }

  return {
    get tokens(): ThemeTokens {
      return tokens as ThemeTokens;
    },
    update(next?: ThemeInput): ThemeTokens {
      if (next) current = next;
      return paint();
    },
    destroy(): void {
      for (const list of queries) list.removeEventListener?.('change', onChange);
      observer?.disconnect();
    },
  };
}
