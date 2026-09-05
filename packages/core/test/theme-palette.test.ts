import { describe, expect, it } from 'vitest';
import {
  computeTheme,
  contrast,
  DEFAULT_ACCENT,
  parseColor,
  resolveScheme,
  SAMPLE_ACCENTS,
  SIGNAL_NAMES,
  themeToCss,
  TOKEN_NAMES,
  type Oklch,
  type ResolvedScheme,
  type ThemeTokens,
  type TokenName,
} from '../src/theme/index.js';

const SCHEMES: ResolvedScheme[] = ['light', 'dark'];

const at = (t: ThemeTokens, name: TokenName): Oklch => parseColor(t[name]) as Oklch;

/** Every pair the spec requires to clear WCAG AA. */
function inkPairs(): [TokenName, TokenName][] {
  const pairs: [TokenName, TokenName][] = [];
  const surfaces: TokenName[] = ['--annot-surface', '--annot-surface-2', '--annot-surface-3', '--annot-accent-soft'];
  for (const ink of ['--annot-ink', '--annot-ink-2', '--annot-ink-3'] as TokenName[]) {
    for (const surface of surfaces) pairs.push([ink, surface]);
  }
  pairs.push(['--annot-accent-ink', '--annot-accent']);
  for (const pill of ['--annot-pill', '--annot-pill-hover', '--annot-pill-active'] as TokenName[]) {
    pairs.push(['--annot-pill-ink', pill]);
  }
  for (const name of SIGNAL_NAMES) pairs.push([`--annot-${name}-ink`, `--annot-${name}`]);
  return pairs;
}

describe('computeTheme', () => {
  it('emits every token and nothing else', () => {
    const t = computeTheme();
    expect(Object.keys(t).sort()).toEqual([...TOKEN_NAMES].sort());
    for (const name of TOKEN_NAMES) expect(t[name], name).toBeTruthy();
  });

  it('keeps every ink above 4.5 on its surface, both schemes, all six sample accents', () => {
    for (const [label, accent] of Object.entries(SAMPLE_ACCENTS)) {
      for (const scheme of SCHEMES) {
        const t = computeTheme({ accent, scheme });
        for (const [ink, surface] of inkPairs()) {
          const ratio = contrast(t[ink], t[surface]);
          expect(ratio, `${label}/${scheme}: ${ink} on ${surface} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('tints the neutrals with the accent hue', () => {
    const t = computeTheme({ accent: '#f97316', scheme: 'light' });
    const accentHue = at(t, '--annot-accent').h;
    for (const name of ['--annot-surface', '--annot-surface-2', '--annot-ink', '--annot-line'] as TokenName[]) {
      expect(Math.abs(at(t, name).h - accentHue), name).toBeLessThan(1);
      expect(at(t, name).c, name).toBeGreaterThan(0);
      expect(at(t, name).c, name).toBeLessThan(0.02);
    }
  });

  it('clamps accent chroma to [0.04, 0.2] and lifts dark-scheme lightness', () => {
    const gray = computeTheme({ accent: '#6b7280', scheme: 'light' });
    expect(at(gray, '--annot-accent').c).toBeCloseTo(0.04, 2);
    const loud = computeTheme({ accent: 'oklch(0.6 0.35 20)', scheme: 'light' });
    expect(at(loud, '--annot-accent').c).toBeLessThanOrEqual(0.2 + 1e-6);
    const dark = computeTheme({ accent: '#111827', scheme: 'dark' });
    expect(at(dark, '--annot-accent').l).toBeGreaterThanOrEqual(0.72);
  });

  it('derives the mode hues as siblings of the accent', () => {
    const t = computeTheme({ accent: '#0d9488', scheme: 'light' });
    const h = at(t, '--annot-accent').h;
    const delta = (name: TokenName): number => ((at(t, name).h - h + 540) % 360) - 180;
    expect(delta('--annot-element')).toBeCloseTo(0, 1);
    expect(delta('--annot-text')).toBeCloseTo(40, 1);
    expect(delta('--annot-page')).toBeCloseTo(-40, 1);
    expect(at(t, '--annot-question').h).toBeCloseTo(75, 1);
    expect(at(t, '--annot-review').h).toBeCloseTo(150, 1);
    expect(at(t, '--annot-draft').c).toBeCloseTo(at(t, '--annot-sent').c * 0.6, 2);
  });

  it('offers H, H±40, H+180 and neutral ink as the drawing palette', () => {
    const t = computeTheme({ accent: '#7c3aed', scheme: 'light' });
    const h = at(t, '--annot-accent').h;
    const delta = (name: TokenName): number => ((at(t, name).h - h + 540) % 360) - 180;
    expect(delta('--annot-stroke-1')).toBeCloseTo(0, 1);
    expect(delta('--annot-stroke-2')).toBeCloseTo(40, 1);
    expect(delta('--annot-stroke-3')).toBeCloseTo(-40, 1);
    expect(Math.abs(delta('--annot-stroke-4'))).toBeCloseTo(180, 1);
    expect(at(t, '--annot-stroke-5').c).toBeLessThan(0.02);
  });

  it('inverts the pill relative to the page', () => {
    const light = computeTheme({ scheme: 'light' });
    const dark = computeTheme({ scheme: 'dark' });
    expect(at(light, '--annot-pill').l).toBeLessThan(at(light, '--annot-surface').l);
    expect(at(dark, '--annot-pill').l).toBeGreaterThan(at(dark, '--annot-surface').l);
    expect(at(light, '--annot-pill').l).toBeCloseTo(at(dark, '--annot-surface-2').l, 2);
  });

  it('gives approved and lost neutral treatment', () => {
    const t = computeTheme({ accent: '#f97316', scheme: 'dark' });
    for (const name of ['--annot-approved', '--annot-lost'] as TokenName[]) {
      expect(at(t, name).c, name).toBeLessThan(0.02);
      expect(t[name]).toBe(t['--annot-ink-3']);
    }
  });

  it('scales spacing and chrome for compact density', () => {
    const roomy = computeTheme({ density: 'comfortable' });
    const tight = computeTheme({ density: 'compact' });
    expect(roomy['--annot-space-5']).toBe('24px');
    expect(tight['--annot-space-5']).toBe('19px');
    expect(roomy['--annot-pill-h']).toBe('44px');
    expect(tight['--annot-pill-h']).toBe('35px');
    expect(roomy['--annot-panel-w']).toBe(tight['--annot-panel-w']);
  });

  it('honours radius, font and overrides', () => {
    const t = computeTheme({
      radius: 4,
      font: 'Inter, sans-serif',
      overrides: { '--annot-accent': 'rebeccapurple' },
    });
    expect(t['--annot-radius']).toBe('4px');
    expect(t['--annot-radius-sm']).toBe('4px');
    expect(t['--annot-font']).toBe('Inter, sans-serif');
    expect(t['--annot-accent']).toBe('rebeccapurple');
  });

  it('zeroes durations under reduced motion', () => {
    expect(computeTheme({}, false, true)['--annot-motion-enter']).toBe('0ms');
    expect(computeTheme({}, false, false)['--annot-motion-enter']).toBe('200ms');
  });

  it('falls back to the default accent on garbage', () => {
    expect(computeTheme({ accent: 'nonsense' })).toEqual(computeTheme({ accent: DEFAULT_ACCENT }));
  });

  it('resolves auto from the media query', () => {
    expect(resolveScheme('auto', true)).toBe('dark');
    expect(resolveScheme(undefined, false)).toBe('light');
    expect(resolveScheme('light', true)).toBe('light');
    expect(computeTheme({ scheme: 'auto' }, true)['--annot-color-scheme']).toBe('dark');
  });
});

describe('themeToCss', () => {
  it('writes one rule with every token', () => {
    const css = themeToCss(computeTheme());
    expect(css.startsWith(':host {')).toBe(true);
    expect(css.trimEnd().endsWith('}')).toBe(true);
    for (const name of TOKEN_NAMES) expect(css).toContain(`  ${name}: `);
  });

  it('takes a selector', () => {
    expect(themeToCss(computeTheme(), '.sheet')).toContain('.sheet {');
  });
});
