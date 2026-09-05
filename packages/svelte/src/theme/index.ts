// TODO(ws-03): replace this whole file. WS 03 owns `src/theme/`; the real one re-exports the color
// math from `@llm-ui-annotation/core/theme` and keeps `applyTheme` here. The token names below are
// frozen by docs/specs/03-theming-and-design.md and must not change.

export type SchemeOption = 'light' | 'dark' | 'auto';
export type Scheme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

export const STATUS_TOKENS = [
  'element',
  'text',
  'page',
  'draft',
  'sent',
  'acknowledged',
  'question',
  'review',
  'approved',
  'lost',
] as const;

export type StatusToken = (typeof STATUS_TOKENS)[number];

export type TokenName =
  | '--annot-accent'
  | '--annot-accent-ink'
  | '--annot-accent-soft'
  | '--annot-accent-line'
  | '--annot-surface'
  | '--annot-surface-2'
  | '--annot-surface-3'
  | '--annot-ink'
  | '--annot-ink-2'
  | '--annot-ink-3'
  | '--annot-line'
  | '--annot-shadow'
  | '--annot-scrim'
  | '--annot-pill'
  | '--annot-pill-ink'
  | '--annot-pill-hover'
  | '--annot-pill-active'
  | '--annot-font'
  | '--annot-mono'
  | '--annot-radius'
  | '--annot-radius-sm'
  | '--annot-space'
  | `--annot-${StatusToken}`
  | `--annot-${StatusToken}-fill`
  | `--annot-${StatusToken}-ink`;

export type Tokens = Record<TokenName, string>;

export interface ThemeInput {
  accent: string;
  scheme: SchemeOption;
  density?: Density;
  radius?: number;
  font?: string;
  overrides?: Partial<Tokens>;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

export const DEFAULT_ACCENT = 'oklch(0.62 0.16 250)';

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  teal: '#008080',
  purple: '#800080',
  orange: '#ffa500',
  gray: '#808080',
  grey: '#808080',
};

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgbToOklch(r: number, g: number, b: number, alpha: number): Oklch {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h, alpha };
}

/** Parse a CSS color into oklch. Hex, `rgb()`, `oklch()` and a few names; null otherwise. */
export function parseColor(css: string): Oklch | null {
  const text = css.trim().toLowerCase();
  if (!text) return null;
  const named = NAMED[text];
  if (named) return parseColor(named);

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const wide = hex.length > 4;
    const step = wide ? 2 : 1;
    if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) return null;
    const part = (i: number): number => {
      const raw = hex.slice(i * step, i * step + step);
      const v = parseInt(wide ? raw : raw + raw, 16);
      return Number.isNaN(v) ? 0 : v / 255;
    };
    const alpha = hex.length === 4 || hex.length === 8 ? part(3) : 1;
    return rgbToOklch(part(0), part(1), part(2), alpha);
  }

  const oklch = /^oklch\(\s*([\d.%]+)\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (oklch) {
    const [, rawL = '0', rawC = '0', rawH = '0'] = oklch;
    const l = rawL.endsWith('%') ? parseFloat(rawL) / 100 : parseFloat(rawL);
    return { l, c: parseFloat(rawC), h: parseFloat(rawH), alpha: 1 };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb) {
    const [, r = '0', g = '0', b = '0'] = rgb;
    return rgbToOklch(parseFloat(r) / 255, parseFloat(g) / 255, parseFloat(b) / 255, 1);
  }

  return null;
}

const round = (n: number, places = 3): number => Number(n.toFixed(places));

/** An `oklch()` string, with the alpha slash only when it is below 1. */
export function oklch(l: number, c: number, h: number, alpha = 1): string {
  const base = `${round(Math.min(1, Math.max(0, l)))} ${round(Math.max(0, c))} ${round(h, 2)}`;
  return alpha >= 1 ? `oklch(${base})` : `oklch(${base} / ${round(alpha, 3)})`;
}

const HUES: Record<StatusToken, (h: number) => number> = {
  element: (h) => h,
  text: (h) => (h + 40) % 360,
  page: (h) => (h + 320) % 360,
  draft: (h) => h,
  sent: (h) => h,
  acknowledged: (h) => h,
  question: () => 75,
  review: () => 150,
  approved: (h) => h,
  lost: (h) => h,
};

/** The full token set for one accent and resolved scheme. */
export function computeTheme(input: ThemeInput, prefersDark = false): Tokens {
  const scheme: Scheme =
    input.scheme === 'auto' ? (prefersDark ? 'dark' : 'light') : (input.scheme ?? 'light');
  const dark = scheme === 'dark';
  const parsed = parseColor(input.accent) ?? parseColor(DEFAULT_ACCENT)!;
  const h = parsed.h;
  const c = Math.min(0.2, Math.max(0.04, parsed.c));
  const l = dark ? Math.max(0.72, parsed.l) : parsed.l;
  const nc = dark ? 0.012 : 0.008;
  const radius = input.radius ?? 10;
  const space = input.density === 'compact' ? 3.2 : 4;

  const accentInk = l > 0.68 ? oklch(0.2, 0.02, h) : oklch(0.99, 0.005, h);

  const tokens = {
    '--annot-accent': oklch(l, c, h),
    '--annot-accent-ink': accentInk,
    '--annot-accent-soft': dark ? oklch(0.28, c * 0.5, h) : oklch(0.94, c * 0.35, h),
    '--annot-accent-line': dark ? oklch(0.6, c * 0.8, h) : oklch(0.72, c * 0.8, h),
    '--annot-surface': dark ? oklch(0.18, nc, h) : oklch(0.99, nc, h),
    '--annot-surface-2': dark ? oklch(0.22, nc, h) : oklch(0.96, nc, h),
    '--annot-surface-3': dark ? oklch(0.27, nc, h) : oklch(0.93, nc, h),
    '--annot-ink': dark ? oklch(0.95, nc, h) : oklch(0.2, 0.01, h),
    '--annot-ink-2': dark ? oklch(0.72, nc, h) : oklch(0.45, 0.01, h),
    '--annot-ink-3': dark ? oklch(0.55, nc, h) : oklch(0.62, 0.01, h),
    '--annot-line': dark ? oklch(0.32, 0.012, h) : oklch(0.88, 0.012, h),
    '--annot-shadow': dark
      ? '0 8px 24px oklch(0 0 0 / 0.5)'
      : `0 8px 24px ${oklch(0.2, 0.02, h, 0.18)}`,
    '--annot-scrim': dark ? 'oklch(0 0 0 / 0.55)' : oklch(0.2, 0.02, h, 0.35),
    '--annot-pill': dark ? oklch(0.99, nc, h) : oklch(0.18, nc, h),
    '--annot-pill-ink': dark ? oklch(0.2, 0.01, h) : oklch(0.95, nc, h),
    '--annot-pill-hover': dark ? oklch(0.93, nc, h) : oklch(0.27, nc, h),
    '--annot-pill-active': oklch(l, c, h),
    '--annot-font': input.font ?? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    '--annot-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    '--annot-radius': `${radius}px`,
    '--annot-radius-sm': `${Math.max(4, radius - 4)}px`,
    '--annot-space': `${space}px`,
  } as Tokens;

  for (const name of STATUS_TOKENS) {
    const sh = HUES[name](h);
    const sc = name === 'lost' || name === 'approved' ? 0.01 : Math.max(0.08, c);
    const sl = dark ? 0.75 : 0.55;
    tokens[`--annot-${name}`] = oklch(sl, name === 'draft' ? sc * 0.6 : sc, sh);
    tokens[`--annot-${name}-fill`] = oklch(sl, sc, sh, dark ? 0.28 : 0.18);
    tokens[`--annot-${name}-ink`] = dark ? oklch(0.95, 0.01, sh) : oklch(0.2, 0.02, sh);
  }

  return { ...tokens, ...input.overrides };
}

/** The tokens as CSS declarations, newline separated. */
export function themeToCss(tokens: Tokens): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}

/** The accent the host page asks for, by the precedence in spec 03. */
export function hostAccent(doc: Document): string | null {
  const root = doc.documentElement;
  if (!root) return null;
  const view = doc.defaultView;
  if (!view) return null;
  const declared = root.style.getPropertyValue('--annot-accent').trim();
  if (declared) return declared;
  const computed = view.getComputedStyle(root).getPropertyValue('--annot-accent').trim();
  if (computed) return computed;
  const body = doc.body;
  if (!body) return null;
  const accentColor = view.getComputedStyle(body).accentColor;
  if (accentColor && accentColor !== 'auto') return accentColor;
  return null;
}

/** The scheme the host page declares, when it declares one. */
export function hostScheme(doc: Document): Scheme | null {
  const view = doc.defaultView;
  if (!view || !doc.documentElement) return null;
  const declared = view.getComputedStyle(doc.documentElement).colorScheme;
  if (declared === 'dark') return 'dark';
  if (declared === 'light') return 'light';
  return null;
}

export interface AppliedTheme {
  tokens: Tokens;
  scheme: Scheme;
  refresh(): void;
  dispose(): void;
}

/** Write the tokens on `host` and keep them in sync with the page's scheme and accent. */
export function applyTheme(host: HTMLElement, input: ThemeInput, doc?: Document): AppliedTheme {
  const document_ = doc ?? host.ownerDocument;
  const view = document_.defaultView;
  const media = view?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

  const state: AppliedTheme = {
    tokens: {} as Tokens,
    scheme: 'light',
    refresh,
    dispose,
  };

  function resolve(): { accent: string; scheme: Scheme } {
    const accent = input.accent || hostAccent(document_) || DEFAULT_ACCENT;
    const wanted = input.scheme ?? 'auto';
    if (wanted !== 'auto') return { accent, scheme: wanted };
    return { accent, scheme: hostScheme(document_) ?? (media?.matches ? 'dark' : 'light') };
  }

  function refresh(): void {
    const { accent, scheme } = resolve();
    const tokens = computeTheme({ ...input, accent, scheme }, scheme === 'dark');
    for (const [name, value] of Object.entries(tokens)) host.style.setProperty(name, value);
    state.tokens = tokens;
    state.scheme = scheme;
  }

  const observer = view ? new view.MutationObserver(refresh) : null;
  observer?.observe(document_.documentElement, { attributeFilter: ['style', 'class'] });
  media?.addEventListener?.('change', refresh);

  function dispose(): void {
    observer?.disconnect();
    media?.removeEventListener?.('change', refresh);
  }

  refresh();
  return state;
}
