import { clampToGamut, contrast, formatOklch, oklch, parseColor, type Oklch } from './color.js';
import {
  SIGNAL_NAMES,
  TOKEN_NAMES,
  type SignalName,
  type ThemeTokens,
  type TokenName,
} from './tokens.js';

export type Scheme = 'light' | 'dark' | 'auto';
export type ResolvedScheme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

export interface ThemeInput {
  /** Any CSS color. */
  accent?: string;
  scheme?: Scheme;
  density?: Density;
  /** px. */
  radius?: number;
  font?: string;
  /** Escape hatch, discouraged. */
  overrides?: Partial<Record<TokenName, string>>;
}

export const DEFAULT_ACCENT = 'oklch(0.62 0.16 250)';
export const DEFAULT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const DEFAULT_FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
export const DEFAULT_RADIUS = 10;

/** Accents the palette is regression-tested against. */
export const SAMPLE_ACCENTS: Readonly<Record<string, string>> = {
  teal: '#0d9488',
  purple: '#7c3aed',
  orange: '#f97316',
  'near-gray': '#6b7280',
  'very-dark': '#111827',
  'very-light': '#f8fafc',
};

const CHROMA_RANGE = { min: 0.04, max: 0.2 } as const;

interface SchemeSpec {
  surface: [number, number, number, number];
  neutralChroma: number;
  ink: [number, number, number];
  line: number;
  /** The accent's lightness is pulled into this band so it stays visible on the surface. */
  accentL: [number, number];
  accentSoft: { l: number; c: number };
  accentLine: { l: number; c: number };
  signalL: number;
  fillAlpha: number;
  washAlpha: number;
}

const SCHEMES: Record<ResolvedScheme, SchemeSpec> = {
  light: {
    surface: [0.99, 0.96, 0.93, 0.88],
    neutralChroma: 0.008,
    ink: [0.2, 0.45, 0.51],
    line: 0.88,
    accentL: [0, 0.72],
    accentSoft: { l: 0.94, c: 0.35 },
    accentLine: { l: 0.72, c: 0.8 },
    signalL: 0.55,
    fillAlpha: 0.18,
    washAlpha: 0.08,
  },
  dark: {
    surface: [0.18, 0.22, 0.27, 0.32],
    neutralChroma: 0.012,
    ink: [0.95, 0.72, 0.66],
    line: 0.32,
    accentL: [0.72, 1],
    accentSoft: { l: 0.28, c: 0.5 },
    accentLine: { l: 0.6, c: 0.8 },
    signalL: 0.75,
    fillAlpha: 0.28,
    washAlpha: 0.12,
  },
};

interface SignalSpec {
  hue: number | null;
  chroma: number;
  neutral?: true;
}

const SIGNALS: Record<SignalName, SignalSpec> = {
  element: { hue: 0, chroma: 1 },
  text: { hue: 40, chroma: 1 },
  page: { hue: -40, chroma: 1 },
  draft: { hue: 0, chroma: 0.6 },
  sent: { hue: 0, chroma: 1 },
  acknowledged: { hue: 0, chroma: 1 },
  question: { hue: null, chroma: 1 },
  review: { hue: null, chroma: 1 },
  approved: { hue: 0, chroma: 0, neutral: true },
  lost: { hue: 0, chroma: 0, neutral: true },
};

const FIXED_HUES: Partial<Record<SignalName, number>> = { question: 75, review: 150 };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const invert = (scheme: ResolvedScheme): ResolvedScheme => (scheme === 'light' ? 'dark' : 'light');

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;

/** Whichever of near-black or white reads better on `bg`; always clears 4.5 by construction. */
function pickInk(bg: Oklch, hue: number): string {
  const dark = clampToGamut({ l: 0.08, c: 0.01, h: hue, alpha: 1 });
  const light = { l: 1, c: 0, h: 0, alpha: 1 };
  return formatOklch(contrast(bg, dark) >= contrast(bg, light) ? dark : light);
}

/** `auto` resolves against the host hint first, then the media query. */
export function resolveScheme(scheme: Scheme | undefined, prefersDark: boolean): ResolvedScheme {
  if (scheme === 'light' || scheme === 'dark') return scheme;
  return prefersDark ? 'dark' : 'light';
}

/** Derive every token from one accent. */
export function computeTheme(
  input: ThemeInput = {},
  prefersDark = false,
  prefersReducedMotion = false,
): ThemeTokens {
  const scheme = resolveScheme(input.scheme, prefersDark);
  const spec = SCHEMES[scheme];
  const inverse = SCHEMES[invert(scheme)];

  const base = clampToGamut(parseColor(input.accent ?? DEFAULT_ACCENT) ?? (parseColor(DEFAULT_ACCENT) as Oklch));
  const h = base.h;
  const c = clamp(base.c, CHROMA_RANGE.min, CHROMA_RANGE.max);

  const neutral = (l: number, chroma = spec.neutralChroma): Oklch =>
    clampToGamut({ l, c: chroma, h, alpha: 1 });
  const inverseNeutral = (l: number): Oklch => clampToGamut({ l, c: inverse.neutralChroma, h, alpha: 1 });

  const accent = clampToGamut({ l: clamp(base.l, spec.accentL[0], spec.accentL[1]), c, h, alpha: 1 });

  const t = {} as ThemeTokens;
  const set = (name: TokenName, value: string): void => {
    t[name] = value;
  };

  set('--annot-color-scheme', scheme);
  set('--annot-accent', formatOklch(accent));
  set('--annot-accent-ink', pickInk(accent, h));
  set('--annot-accent-soft', formatOklch(clampToGamut({ l: spec.accentSoft.l, c: c * spec.accentSoft.c, h, alpha: 1 })));
  set('--annot-accent-line', formatOklch(clampToGamut({ l: spec.accentLine.l, c: c * spec.accentLine.c, h, alpha: 1 })));

  const [s1, s2, s3] = spec.surface;
  set('--annot-surface', formatOklch(neutral(s1)));
  set('--annot-surface-2', formatOklch(neutral(s2)));
  set('--annot-surface-3', formatOklch(neutral(s3)));

  const [i1, i2, i3] = spec.ink;
  set('--annot-ink', formatOklch(neutral(i1, spec.neutralChroma + 0.002)));
  set('--annot-ink-2', formatOklch(neutral(i2)));
  set('--annot-ink-3', formatOklch(neutral(i3)));
  set('--annot-line', formatOklch(neutral(spec.line, 0.012)));

  set('--annot-shadow', `0 8px 24px ${scheme === 'light' ? oklch(0.2, 0.02, h, 0.18) : 'oklch(0 0 0 / 0.5)'}`);
  set('--annot-scrim', scheme === 'light' ? oklch(0.2, 0.02, h, 0.35) : 'oklch(0 0 0 / 0.55)');

  const [, ps2, ps3, ps4] = inverse.surface;
  const pillInkL = inverse.ink[0];
  set('--annot-pill', formatOklch(inverseNeutral(ps2)));
  set('--annot-pill-hover', formatOklch(inverseNeutral(ps3)));
  set('--annot-pill-active', formatOklch(inverseNeutral(ps4)));
  set('--annot-pill-ink', formatOklch(inverseNeutral(pillInkL)));

  for (const name of SIGNAL_NAMES) {
    const sig = SIGNALS[name];
    const color = sig.neutral
      ? neutral(i3)
      : clampToGamut({ l: spec.signalL, c: c * sig.chroma, h: FIXED_HUES[name] ?? h + (sig.hue ?? 0), alpha: 1 });
    set(`--annot-${name}`, formatOklch(color));
    set(`--annot-${name}-fill`, oklch(color.l, color.c, color.h, spec.fillAlpha));
    set(`--annot-${name}-wash`, oklch(color.l, color.c, color.h, spec.washAlpha));
    set(`--annot-${name}-ink`, pickInk(color, color.h));
  }

  // The one place the accent does not reach: Chrome's box model colours, which people already read
  // without a legend. Same values in both schemes, as in devtools.
  set('--annot-box-content', 'rgba(111, 168, 220, 0.66)');
  set('--annot-box-padding', 'rgba(147, 196, 125, 0.55)');
  set('--annot-box-border', 'rgba(255, 229, 153, 0.66)');
  set('--annot-box-margin', 'rgba(246, 178, 107, 0.66)');
  set('--annot-box-ink', 'rgba(26, 26, 26, 0.92)');

  const stroke = (dh: number): string =>
    formatOklch(clampToGamut({ l: spec.signalL, c, h: h + dh, alpha: 1 }));
  set('--annot-stroke-1', stroke(0));
  set('--annot-stroke-2', stroke(40));
  set('--annot-stroke-3', stroke(-40));
  set('--annot-stroke-4', stroke(180));
  set('--annot-stroke-5', formatOklch(neutral(i1, spec.neutralChroma)));

  const scale = input.density === 'compact' ? 0.8 : 1;
  const radius = input.radius ?? DEFAULT_RADIUS;

  set('--annot-font', input.font ?? DEFAULT_FONT);
  set('--annot-font-mono', DEFAULT_FONT_MONO);
  set('--annot-text-xs', px(11));
  set('--annot-text-sm', px(12));
  set('--annot-text-md', px(13));
  set('--annot-text-lg', px(15));
  set('--annot-text-mono', px(11.5));

  const spacing = [4, 8, 12, 16, 24] as const;
  spacing.forEach((v, i) => set(`--annot-space-${i + 1}` as TokenName, px(Math.round(v * scale))));

  set('--annot-radius', px(radius));
  set('--annot-radius-sm', px(Math.max(4, Math.round(radius * 0.6))));
  set('--annot-radius-pill', '999px');
  set('--annot-radius-marker', '999px');

  set('--annot-pill-h', px(Math.round(44 * scale)));
  set('--annot-control-h', px(Math.round(36 * scale)));
  set('--annot-marker-size', px(22));
  set('--annot-panel-w', px(360));
  set('--annot-popup-w', px(360));

  const motion = (ms: number): string => `${prefersReducedMotion ? 0 : ms}ms`;
  set('--annot-motion-fast', motion(120));
  set('--annot-motion-enter', motion(200));
  set('--annot-motion-exit', motion(120));
  set('--annot-ease', 'cubic-bezier(.2,.8,.2,1)');

  for (const [name, value] of Object.entries(input.overrides ?? {})) {
    if (value !== undefined) set(name as TokenName, value);
  }
  return t;
}

/** Emit the tokens as one CSS rule. */
export function themeToCss(tokens: ThemeTokens, selector = ':host'): string {
  const body = TOKEN_NAMES.map((name) => `  ${name}: ${tokens[name]};`).join('\n');
  return `${selector} {\n${body}\n}\n`;
}
