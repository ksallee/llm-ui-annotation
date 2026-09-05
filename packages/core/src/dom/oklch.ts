// TODO(ws-03): replace with `toOklch` from `../theme/index.js`; this is the only import site.

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  olive: [128, 128, 0],
  maroon: [128, 0, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
};

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parse(css: string): [number, number, number, number] | null {
  const value = css.trim().toLowerCase();
  if (value === '' || value === 'transparent') return null;

  const named = NAMED[value];
  if (named) return [...named, 1];

  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex) {
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
    const size = hex.length <= 4 ? 1 : 2;
    if (hex.length !== size * 3 && hex.length !== size * 4) return null;
    const parts = [];
    for (let i = 0; i < hex.length; i += size) parts.push(expand(hex.slice(i, i + size)));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] === undefined ? 1 : parts[3] / 255];
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(value)?.[1];
  if (rgb) {
    const parts = rgb.split(/[\s,/]+/).filter((p) => p !== '').map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }

  return null;
}

function round(n: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

/** `oklch(l c h)` for a CSS color, or the input unchanged when it cannot be parsed. */
export function toOklch(css: string): string {
  if (/^oklch\(/i.test(css.trim())) return css.trim();

  const rgba = parse(css);
  if (!rgba) return css.trim();
  const [r, g, b, alpha] = rgba;

  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.hypot(a, bb);
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  const head = `${round(lightness, 3)} ${round(chroma, 3)} ${round(hue, 2)}`;
  return alpha < 1 ? `oklch(${head} / ${round(alpha, 3)})` : `oklch(${head})`;
}

export function isParsableColor(css: string): boolean {
  return parse(css) !== null;
}
