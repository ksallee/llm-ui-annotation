const MAX_SLUG = 120;
const HASH_LEN = 8;

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(HASH_LEN, '0').slice(-HASH_LEN);
}

/** File-safe key for a route. Truncated slugs keep an 8-char hash of the full route. */
export function slug(route: string): string {
  if (route === '/' || route === '') return 'index';

  let s = route
    .toLowerCase()
    .replaceAll('/', '__')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/_{3,}/g, '__')
    .replace(/^-+|-+$/g, '');

  if (s === '' || s === '__') return 'index';

  if (s.length > MAX_SLUG) {
    s = `${s.slice(0, MAX_SLUG - HASH_LEN - 1).replace(/-+$/g, '')}-${hash(route)}`;
  }
  return s;
}

const SLUG_PATTERN = /^[a-z0-9_-]+$/;

/** True when `x` is a slug `slug()` could have produced. Guards path building against traversal. */
export function isSlug(x: unknown): x is string {
  return typeof x === 'string' && x.length <= MAX_SLUG && SLUG_PATTERN.test(x);
}
