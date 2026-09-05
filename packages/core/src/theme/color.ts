import { NAMED_COLORS } from './named.js';

/** Oklch with hue in degrees and alpha in `[0, 1]`. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/** Gamma-encoded sRGB, every channel in `[0, 1]`. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const toLinear = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const toGamma = (v: number): number =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

/** Gamma-encoded sRGB to Oklch. */
export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const lm = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sm = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * lm + 0.793617785 * mm - 0.0040720468 * sm;
  const a = 1.9779984951 * lm - 2.428592205 * mm + 0.4505937099 * sm;
  const bb = 0.0259040371 * lm + 0.7827717662 * mm - 0.808675766 * sm;

  return oklabToOklch(l, a, bb, rgb.alpha);
}

/** Oklab components to Oklch, hue normalized to `[0, 360)`. */
export function oklabToOklch(l: number, a: number, b: number, alpha = 1): Oklch {
  const c = Math.hypot(a, b);
  const h = c < 1e-7 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h, alpha };
}

/** Oklch to gamma-encoded sRGB. Channels may fall outside `[0, 1]` when out of gamut. */
export function oklchToRgb(color: Oklch): Rgb {
  const hr = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hr);
  const b = color.c * Math.sin(hr);

  const lm = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mm = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sm = color.l - 0.0894841775 * a - 1.291485548 * b;

  const l = lm * lm * lm;
  const m = mm * mm * mm;
  const s = sm * sm * sm;

  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: color.alpha,
  };
}

const GAMUT_EPSILON = 1e-4;

/** Whether the color survives a round trip through sRGB without clipping. */
export function inGamut(color: Oklch): boolean {
  const { r, g, b } = oklchToRgb(color);
  return [r, g, b].every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

/** Reduce chroma by bisection until the color fits in sRGB. */
export function clampToGamut(color: Oklch): Oklch {
  const l = clamp(color.l, 0, 1);
  const alpha = clamp(color.alpha, 0, 1);
  const base = { l, c: Math.max(color.c, 0), h: color.h, alpha };
  if (inGamut(base)) return base;

  let lo = 0;
  let hi = base.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...base, c: mid })) lo = mid;
    else hi = mid;
  }
  return { ...base, c: lo };
}

const round = (v: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** Format Oklch components as a CSS `oklch()` string. */
export function oklch(l: number, c: number, h: number, alpha = 1): string {
  const head = `${round(clamp(l, 0, 1), 3)} ${round(Math.max(c, 0), 3)} ${round(((h % 360) + 360) % 360, 2)}`;
  return alpha >= 1 ? `oklch(${head})` : `oklch(${head} / ${round(clamp(alpha, 0, 1), 3)})`;
}

/** Format an Oklch value as a CSS `oklch()` string. */
export const formatOklch = (color: Oklch): string => oklch(color.l, color.c, color.h, color.alpha);

const ANGLE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|rad|grad|turn)?$/;
const NUMBER = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%?)$/;

const angle = (token: string): number | null => {
  if (token === 'none') return 0;
  const m = ANGLE.exec(token);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  switch (m[2]) {
    case 'rad':
      return (v * 180) / Math.PI;
    case 'grad':
      return v * 0.9;
    case 'turn':
      return v * 360;
    default:
      return v;
  }
};

/** `percentScale` is the value 100% maps to; `plainIsPercent` treats a bare number as a percentage. */
const number = (token: string, percentScale: number, plainIsPercent = false): number | null => {
  if (token === 'none') return 0;
  const m = NUMBER.exec(token);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  if (m[2] === '%') return (v / 100) * percentScale;
  return plainIsPercent ? (v / 100) * percentScale : v;
};

interface FnArgs {
  name: string;
  parts: string[];
  alpha: string | null;
}

const fn = (css: string): FnArgs | null => {
  const open = css.indexOf('(');
  if (open < 0 || !css.endsWith(')')) return null;
  const body = css.slice(open + 1, -1).replace(/,/g, ' ').trim();
  const [head, tail, ...rest] = body.split('/');
  if (rest.length > 0 || head === undefined) return null;
  const parts = head.trim().split(/\s+/).filter(Boolean);
  return { name: css.slice(0, open).trim(), parts, alpha: tail === undefined ? null : tail.trim() };
};

const hexToRgb = (hex: string): Rgb | null => {
  const h = hex.slice(1);
  const expand = (s: string): string => (s.length <= 4 ? [...s].map((ch) => ch + ch).join('') : s);
  if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  const full = expand(h);
  const at = (i: number): number => parseInt(full.slice(i, i + 2), 16) / 255;
  return { r: at(0), g: at(2), b: at(4), alpha: full.length === 8 ? at(6) : 1 };
};

const hslToRgb = (h: number, s: number, l: number, alpha: number): Rgb => {
  const sat = clamp(s, 0, 1);
  const lig = clamp(l, 0, 1);
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number => {
    const k = (n + (((h % 360) + 360) % 360) / 30) % 12;
    return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4), alpha };
};

/** Parse a CSS color into Oklch. Returns null for anything unrecognized. */
export function parseColor(css: string): Oklch | null {
  const raw = css.trim();
  if (raw === '') return null;
  const lower = raw.toLowerCase();

  const named = NAMED_COLORS[lower];
  if (named !== undefined) return rgbToOklch(hexToRgb(named) as Rgb);
  if (lower.startsWith('#')) {
    const rgb = hexToRgb(lower);
    return rgb ? rgbToOklch(rgb) : null;
  }

  const parsed = fn(lower);
  if (!parsed) return null;
  const { name, parts, alpha: alphaToken } = parsed;
  const [p0, p1, p2, p3] = parts;
  if (p0 === undefined || p1 === undefined || p2 === undefined) return null;

  const alphaSource = alphaToken ?? p3 ?? null;
  const alpha = alphaSource === null ? 1 : number(alphaSource, 1);
  if (alpha === null) return null;
  const a = clamp(alpha, 0, 1);

  switch (name) {
    case 'rgb':
    case 'rgba': {
      const r = number(p0, 255);
      const g = number(p1, 255);
      const b = number(p2, 255);
      if (r === null || g === null || b === null) return null;
      return rgbToOklch({ r: clamp(r / 255, 0, 1), g: clamp(g / 255, 0, 1), b: clamp(b / 255, 0, 1), alpha: a });
    }
    case 'hsl':
    case 'hsla': {
      const h = angle(p0);
      const s = number(p1, 1, true);
      const l = number(p2, 1, true);
      if (h === null || s === null || l === null) return null;
      return rgbToOklch(hslToRgb(h, s, l, a));
    }
    case 'oklch': {
      const l = number(p0, 1);
      const c = number(p1, 0.4);
      const h = angle(p2);
      if (l === null || c === null || h === null) return null;
      return { l: clamp(l, 0, 1), c: Math.max(c, 0), h: ((h % 360) + 360) % 360, alpha: a };
    }
    case 'oklab': {
      const l = number(p0, 1);
      const x = number(p1, 0.4);
      const y = number(p2, 0.4);
      if (l === null || x === null || y === null) return null;
      return oklabToOklch(clamp(l, 0, 1), x, y, a);
    }
    default:
      return null;
  }
}

/** Convert any CSS color to an `oklch()` string; unparseable input is returned trimmed and unchanged. */
export function toOklch(css: string): string {
  const parsed = parseColor(css);
  return parsed ? formatOklch(parsed) : css.trim();
}

/** WCAG 2.x relative luminance of a color, alpha ignored. */
export function luminance(color: Oklch | string): number {
  const parsed = typeof color === 'string' ? parseColor(color) : color;
  if (!parsed) return 0;
  const { r, g, b } = oklchToRgb(parsed);
  const lin = (v: number): number => toLinear(clamp(v, 0, 1));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio between two colors, from 1 to 21. Alpha is ignored. */
export function contrast(a: Oklch | string, b: Oklch | string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
