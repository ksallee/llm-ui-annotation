const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RADIX = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export const ID_LENGTH = TIME_LEN + RANDOM_LEN;
export const ID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

const MAX_TIME = RADIX ** TIME_LEN - 1;

let lastTime = -1;
let lastRandom: number[] = [];

function randomDigits(): number[] {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(RANDOM_LEN));
    return Array.from(bytes, (b) => b % RADIX);
  }
  return Array.from({ length: RANDOM_LEN }, () => Math.floor(Math.random() * RADIX));
}

function increment(digits: number[]): number[] {
  const next = digits.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    const d = next[i] ?? 0;
    if (d < RADIX - 1) {
      next[i] = d + 1;
      return next;
    }
    next[i] = 0;
  }
  return randomDigits();
}

function encodeTime(time: number): string {
  let t = Math.floor(time);
  let out = '';
  for (let i = 0; i < TIME_LEN; i++) {
    const mod = t % RADIX;
    out = ENCODING.charAt(mod) + out;
    t = (t - mod) / RADIX;
  }
  return out;
}

/** Sortable 26-char Crockford base32 id. Ids made in the same millisecond stay strictly increasing. */
export function newId(now: number = Date.now()): string {
  const time = Math.floor(now);
  if (!Number.isFinite(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`newId: time out of range: ${String(now)}`);
  }
  const digits =
    time === lastTime && lastRandom.length === RANDOM_LEN ? increment(lastRandom) : randomDigits();
  lastTime = time;
  lastRandom = digits;
  let out = encodeTime(time);
  for (const d of digits) out += ENCODING.charAt(d);
  return out;
}

/** True when `x` is a well-formed id. */
export function isId(x: unknown): x is string {
  return typeof x === 'string' && ID_PATTERN.test(x);
}

/** Milliseconds encoded in the id's time prefix. */
export function idTime(id: string): number {
  let t = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const d = ENCODING.indexOf(id.charAt(i));
    if (d < 0) throw new TypeError(`idTime: not an id: ${id}`);
    t = t * RADIX + d;
  }
  return t;
}

/** Lexicographic comparison, which for ids is chronological. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ISO 8601 UTC timestamp. */
export function nowIso(at: number | Date = Date.now()): string {
  return new Date(at).toISOString();
}
