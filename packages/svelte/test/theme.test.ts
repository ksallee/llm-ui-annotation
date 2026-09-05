import { computeTheme, TOKEN_NAMES } from '@llm-ui-annotation/core/theme';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readAccentHint, readSchemeHint } from '../src/theme/index.js';

const mountHost = (): HTMLElement => {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
};

const stubMedia = (dark: boolean, reduced = false): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') ? reduced : dark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.body.replaceChildren();
  document.body.removeAttribute('style');
});

describe('readAccentHint', () => {
  it('prefers --annot-accent on :root', () => {
    document.documentElement.style.setProperty('--annot-accent', '#0d9488');
    document.body.style.setProperty('accent-color', 'orange');
    expect(readAccentHint(document)).toBe('#0d9488');
  });

  it('falls back to accent-color on body', () => {
    document.body.style.setProperty('accent-color', 'rebeccapurple');
    expect(readAccentHint(document)).toBe('rebeccapurple');
  });

  it('ignores unparseable and auto values', () => {
    document.documentElement.style.setProperty('--annot-accent', 'var(--brand)');
    document.body.style.setProperty('accent-color', 'auto');
    expect(readAccentHint(document)).toBeNull();
  });
});

describe('readSchemeHint', () => {
  it('reads an explicit color-scheme only', () => {
    document.documentElement.style.setProperty('color-scheme', 'dark');
    expect(readSchemeHint(document)).toBe('dark');
    document.documentElement.style.setProperty('color-scheme', 'light dark');
    expect(readSchemeHint(document)).toBeNull();
  });
});

describe('applyTheme', () => {
  it('writes every token onto the host', () => {
    stubMedia(false);
    const host = mountHost();
    const handle = applyTheme(host, { accent: '#0d9488', scheme: 'light' });
    for (const name of TOKEN_NAMES) {
      expect(host.style.getPropertyValue(name), name).toBe(handle.tokens[name]);
    }
    expect(host.style.getPropertyValue('color-scheme')).toBe('light');
    handle.destroy();
  });

  it('takes the accent from the host page when no prop is given', () => {
    stubMedia(false);
    document.documentElement.style.setProperty('--annot-accent', '#f97316');
    const handle = applyTheme(mountHost(), { scheme: 'light' });
    expect(handle.tokens).toEqual(computeTheme({ accent: '#f97316', scheme: 'light' }));
    handle.destroy();
  });

  it('lets the prop win over the host page', () => {
    stubMedia(false);
    document.documentElement.style.setProperty('--annot-accent', '#f97316');
    const handle = applyTheme(mountHost(), { accent: '#7c3aed', scheme: 'light' });
    expect(handle.tokens['--annot-accent']).toBe(computeTheme({ accent: '#7c3aed', scheme: 'light' })['--annot-accent']);
    handle.destroy();
  });

  it('follows prefers-color-scheme and the host color-scheme', () => {
    stubMedia(true);
    const dark = applyTheme(mountHost(), { scheme: 'auto' });
    expect(dark.tokens['--annot-color-scheme']).toBe('dark');
    dark.destroy();

    document.documentElement.style.setProperty('color-scheme', 'light');
    const light = applyTheme(mountHost(), { scheme: 'auto' });
    expect(light.tokens['--annot-color-scheme']).toBe('light');
    light.destroy();
  });

  it('zeroes motion when the user asks for less of it', () => {
    stubMedia(false, true);
    const handle = applyTheme(mountHost(), { scheme: 'light' });
    expect(handle.tokens['--annot-motion-enter']).toBe('0ms');
    handle.destroy();
  });

  it('repaints when the host accent changes', async () => {
    stubMedia(false);
    const host = mountHost();
    const handle = applyTheme(host, { scheme: 'light' });
    const before = handle.tokens['--annot-accent'];
    document.documentElement.style.setProperty('--annot-accent', '#f97316');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handle.tokens['--annot-accent']).not.toBe(before);
    expect(host.style.getPropertyValue('--annot-accent')).toBe(handle.tokens['--annot-accent']);
    handle.destroy();
  });

  it('stops observing after destroy', async () => {
    stubMedia(false);
    const handle = applyTheme(mountHost(), { scheme: 'light' });
    const before = handle.tokens['--annot-accent'];
    handle.destroy();
    document.documentElement.style.setProperty('--annot-accent', '#f97316');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handle.tokens['--annot-accent']).toBe(before);
  });

  it('recomputes on update', () => {
    stubMedia(false);
    const host = mountHost();
    const handle = applyTheme(host, { scheme: 'light' });
    handle.update({ scheme: 'dark', density: 'compact' });
    expect(handle.tokens['--annot-color-scheme']).toBe('dark');
    expect(host.style.getPropertyValue('--annot-space-5')).toBe('19px');
    handle.destroy();
  });
});
