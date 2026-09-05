import { describe, expect, it } from 'vitest';
import {
  clampToGamut,
  contrast,
  formatOklch,
  inGamut,
  luminance,
  NAMED_COLORS,
  oklch,
  oklchToRgb,
  parseColor,
  toOklch,
  type Oklch,
} from '../src/theme/index.js';

const TOL = 0.005;

const near = (a: number, b: number, tol = TOL): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

const expectOklch = (css: string, l: number, c: number, h: number, alpha = 1): void => {
  const got = parseColor(css);
  expect(got, css).not.toBeNull();
  const v = got as Oklch;
  near(v.l, l);
  near(v.c, c);
  if (c > 0.002) near(((v.h - h + 540) % 360) - 180, 0, 0.5);
  near(v.alpha, alpha);
};

describe('parseColor', () => {
  it('matches known sRGB primaries', () => {
    expectOklch('#ff0000', 0.6279, 0.2577, 29.23);
    expectOklch('#00ff00', 0.8664, 0.2948, 142.5);
    expectOklch('#0000ff', 0.452, 0.3132, 264.05);
    expectOklch('#ffffff', 1, 0, 0);
    expectOklch('#000000', 0, 0, 0);
    expectOklch('#808080', 0.5999, 0, 0);
  });

  it('reads every hex length', () => {
    expectOklch('#f00', 0.6279, 0.2577, 29.23);
    expectOklch('#f008', 0.6279, 0.2577, 29.23, 0.5333);
    expectOklch('#FF000080', 0.6279, 0.2577, 29.23, 0.502);
  });

  it('reads rgb, hsl, oklch and oklab in both syntaxes', () => {
    expectOklch('rgb(255, 0, 0)', 0.6279, 0.2577, 29.23);
    expectOklch('rgb(100% 0% 0% / 50%)', 0.6279, 0.2577, 29.23, 0.5);
    expectOklch('rgba(255 0 0 0.25)', 0.6279, 0.2577, 29.23, 0.25);
    expectOklch('hsl(0 100% 50%)', 0.6279, 0.2577, 29.23);
    expectOklch('hsl(0deg, 100%, 50%, 0.5)', 0.6279, 0.2577, 29.23, 0.5);
    expectOklch('hsl(120 100% 50%)', 0.8664, 0.2948, 142.5);
    expectOklch('hsl(0.5turn 100% 50%)', 0.9054, 0.1546, 194.77);
    expectOklch('oklch(0.62 0.16 250)', 0.62, 0.16, 250);
    expectOklch('oklch(62% 40% 250deg / 40%)', 0.62, 0.16, 250, 0.4);
    expectOklch('oklab(0.628 0.225 0.126)', 0.628, 0.2579, 29.24);
  });

  it('reads named colors and transparent', () => {
    expectOklch('red', 0.6279, 0.2577, 29.23);
    expectOklch('REBECCAPURPLE', 0.4407, 0.1636, 303.37);
    expectOklch('transparent', 0, 0, 0, 0);
    expect(Object.keys(NAMED_COLORS)).toHaveLength(149);
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'not-a-color', '#ff00f', 'rgb(1 2)', 'lab(50 20 30)', 'var(--x)', 'oklch(a b c)']) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it('round-trips through sRGB', () => {
    for (const hex of ['#0d9488', '#7c3aed', '#f97316', '#6b7280', '#111827', '#f8fafc']) {
      const back = oklchToRgb(parseColor(hex) as Oklch);
      const to = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0');
      expect(`#${to(back.r)}${to(back.g)}${to(back.b)}`).toBe(hex);
    }
  });
});

describe('oklch and toOklch', () => {
  it('formats', () => {
    expect(oklch(0.62, 0.16, 250)).toBe('oklch(0.62 0.16 250)');
    expect(oklch(0.62, 0.16, 250, 0.18)).toBe('oklch(0.62 0.16 250 / 0.18)');
    expect(oklch(0.62, 0.16, -110)).toBe('oklch(0.62 0.16 250)');
    expect(formatOklch({ l: 1, c: 0, h: 0, alpha: 1 })).toBe('oklch(1 0 0)');
  });

  it('converts', () => {
    expect(toOklch('#ff0000')).toBe('oklch(0.628 0.258 29.23)');
    expect(toOklch('white')).toBe('oklch(1 0 0)');
  });

  it('passes unparseable input through', () => {
    expect(toOklch(' currentColor ')).toBe('currentColor');
  });
});

describe('clampToGamut', () => {
  it('leaves in-gamut colors alone', () => {
    const teal = parseColor('#0d9488') as Oklch;
    expect(clampToGamut(teal)).toEqual(teal);
  });

  it('pulls chroma back until sRGB fits', () => {
    const wild = { l: 0.55, c: 0.4, h: 150, alpha: 1 };
    const fixed = clampToGamut(wild);
    expect(fixed.c).toBeLessThan(wild.c);
    expect(fixed.l).toBe(wild.l);
    expect(fixed.h).toBe(wild.h);
    expect(inGamut(fixed)).toBe(true);
  });

  it('clamps lightness and alpha', () => {
    expect(clampToGamut({ l: 1.4, c: 0, h: 0, alpha: 3 })).toEqual({ l: 1, c: 0, h: 0, alpha: 1 });
  });
});

describe('contrast', () => {
  it('matches WCAG reference pairs', () => {
    near(contrast('#ffffff', '#000000'), 21, 0.01);
    near(contrast('#ffffff', '#ffffff'), 1, 0.01);
    near(contrast('#ffffff', '#767676'), 4.54, 0.02);
    near(contrast('#000000', '#777777'), 4.69, 0.02);
    near(contrast('#1e90ff', '#ffffff'), 3.25, 0.02);
  });

  it('is symmetric and ignores alpha', () => {
    expect(contrast('#123456', '#fedcba')).toBeCloseTo(contrast('#fedcba', '#123456'), 10);
    expect(contrast('#12345680', '#ffffff')).toBeCloseTo(contrast('#123456', '#ffffff'), 10);
  });

  it('reports luminance', () => {
    near(luminance('#ffffff'), 1, 0.001);
    near(luminance('#000000'), 0, 0.001);
  });
});
