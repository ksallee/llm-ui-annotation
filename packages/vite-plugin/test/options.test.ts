import { afterEach, describe, expect, it } from 'vitest';
import { autoModuleSource, overlayOptions, scriptSrc } from '../src/inject.js';
import { defaultRouteKey, matchGlob, resolveOptions } from '../src/options.js';

const ROOT = '/tmp/project';

afterEach(() => {
  delete process.env['ANNOT_DIR'];
});

describe('resolveOptions', () => {
  it('defaults the dir to .annotations at the root', () => {
    expect(resolveOptions({}, ROOT).dir).toBe('/tmp/project/.annotations');
  });

  it('takes ANNOT_DIR when set', () => {
    process.env['ANNOT_DIR'] = '/tmp/run-17/.annotations';
    expect(resolveOptions({}, ROOT).dir).toBe('/tmp/run-17/.annotations');
  });

  it('resolves a relative ANNOT_DIR against the root', () => {
    process.env['ANNOT_DIR'] = '.annot-run';
    expect(resolveOptions({}, ROOT).dir).toBe('/tmp/project/.annot-run');
  });

  it('lets an explicit dir win over ANNOT_DIR', () => {
    process.env['ANNOT_DIR'] = '/tmp/run-17/.annotations';
    expect(resolveOptions({ dir: '/tmp/explicit' }, ROOT).dir).toBe('/tmp/explicit');
  });

  it('fills the remaining defaults', () => {
    const options = resolveOptions({}, ROOT);
    expect(options).toMatchObject({
      inject: true,
      accent: null,
      scheme: 'auto',
      basePath: '/__annot',
      include: null,
      watch: 'native',
    });
    expect(options.routeKey('http://localhost:5173/pricing?plan=pro')).toBe('/pricing');
  });

  it('normalizes the base path', () => {
    expect(resolveOptions({ basePath: 'feedback/' }, ROOT).basePath).toBe('/feedback');
    expect(resolveOptions({ basePath: '/feedback' }, ROOT).basePath).toBe('/feedback');
    expect(resolveOptions({ basePath: '' }, ROOT).basePath).toBe('/__annot');
  });

  it('treats an empty include list as no filter', () => {
    expect(resolveOptions({ include: [] }, ROOT).include).toBeNull();
  });
});

describe('defaultRouteKey', () => {
  it('keeps the pathname only', () => {
    expect(defaultRouteKey('/pricing?plan=pro#top')).toBe('/pricing');
    expect(defaultRouteKey('http://example.test/a/b')).toBe('/a/b');
    expect(defaultRouteKey('')).toBe('/');
  });
});

describe('matchGlob', () => {
  it('matches a single segment with *', () => {
    expect(matchGlob('/docs/*', '/docs/intro')).toBe(true);
    expect(matchGlob('/docs/*', '/docs/a/b')).toBe(false);
  });

  it('crosses segments with **', () => {
    expect(matchGlob('**/*.html', '/a/b/index.html')).toBe(true);
    expect(matchGlob('**/*.html', '/index.html')).toBe(true);
    expect(matchGlob('**/*.html', '/index.htm')).toBe(false);
  });

  it('escapes regex characters in the literal parts', () => {
    expect(matchGlob('/a.b', '/a.b')).toBe(true);
    expect(matchGlob('/a.b', '/axb')).toBe(false);
  });
});

describe('the injected module', () => {
  it('prefixes the script src with the Vite base', () => {
    expect(scriptSrc('/')).toBe('/@id/__x00__virtual:annot-auto');
    expect(scriptSrc('/app/')).toBe('/app/@id/__x00__virtual:annot-auto');
    expect(scriptSrc('/app')).toBe('/app/@id/__x00__virtual:annot-auto');
  });

  it('omits the accent when none was configured', () => {
    expect(overlayOptions(resolveOptions({}, ROOT))).toEqual({
      basePath: '/__annot',
      protocolVersion: 1,
      scheme: 'auto',
    });
  });

  it('warns instead of importing when the overlay package is absent', () => {
    const source = autoModuleSource(resolveOptions({}, ROOT), false);
    expect(source).toContain('console.warn');
    expect(source).not.toContain('import(');
  });
});
