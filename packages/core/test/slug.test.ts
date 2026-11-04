import { describe, expect, it } from 'vitest';
import { batchFile, isSlug, routeFile, slug } from '../src/index.js';

describe('slug', () => {
  it.each([
    ['/', 'index'],
    ['', 'index'],
    ['/pricing', '__pricing'],
    ['/Pricing/Plans', '__pricing__plans'],
    ['/a/b/c', '__a__b__c'],
    ['/docs/getting-started', '__docs__getting-started'],
    ['/search?q=hello world', '__search-q-hello-world'],
    ['/a//b', '__a__b'],
    ['/products/café', '__products__caf'],
    ['/-weird-/', '__-weird-__'],
    ['/my_page', '__my_page'],
    ['/%20%20', '__-20-20'],
  ])('%s -> %s', (route, expected) => {
    expect(slug(route)).toBe(expected);
  });

  it('never exceeds 120 chars and stays unique when truncated', () => {
    const a = `/${'x'.repeat(300)}a`;
    const b = `/${'x'.repeat(300)}b`;
    expect(slug(a).length).toBe(120);
    expect(slug(b).length).toBe(120);
    expect(slug(a)).not.toBe(slug(b));
    expect(slug(a)).toMatch(/-[0-9a-f]{8}$/);
  });

  it('is deterministic', () => {
    expect(slug('/pricing')).toBe(slug('/pricing'));
  });

  it('never yields an empty name', () => {
    expect(slug('///')).toBe('index');
    expect(slug('/---')).toBe('index');
  });
});

describe('paths', () => {
  it('builds the documented layout', () => {
    expect(routeFile('/pricing')).toBe('routes/__pricing.json');
    expect(routeFile('/')).toBe('routes/index.json');
    expect(batchFile('01JB')).toBe('batches/01JB.json');
  });
});

describe('isSlug', () => {
  it('accepts what slug produces', () => {
    for (const route of ['/', '/pricing', '/a/b/c', '/Ünïcode', `/${'x'.repeat(400)}`]) {
      expect(isSlug(slug(route))).toBe(true);
    }
  });

  it('rejects anything that would escape the routes directory', () => {
    for (const bad of ['../../etc/passwd', 'a/b', 'a.json', 'UPPER', '', '.', '..', 'x'.repeat(121)]) {
      expect(isSlug(bad)).toBe(false);
    }
    expect(isSlug(42)).toBe(false);
  });
});
