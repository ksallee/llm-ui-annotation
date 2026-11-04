/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { loadPrefs, PREFS_KEY } from '../src/state/prefs.js';

describe('loadPrefs', () => {
  afterEach(() => localStorage.clear());

  it('keeps a stored mode the overlay still has', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: 'text' }));
    expect(loadPrefs(document).mode).toBe('text');
  });

  it('drops a stored mode it no longer has', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: 'page' }));
    expect(loadPrefs(document).mode).toBeNull();
  });
});
