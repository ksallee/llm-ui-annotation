/** Write a user's replacement into a markdown source at the span a text annotation anchors. */

import type { TextTarget } from '../model/types.js';

export type ReplaceRefusal = 'not-found' | 'ambiguous' | 'formatted';

export type ReplaceResult =
  | { ok: true; text: string; start: number; end: number }
  | { ok: false; reason: ReplaceRefusal };

const INLINE_MARKUP = new Set(['*', '_', '`', '~', '[', ']']);
const LINE_MARKERS = /^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d{1,9}[.)][ \t]+)?/gm;
const LINK_TARGET = /\]\([^)\n]*\)/g;
const ESCAPE = /\\(?=[!-/:-@[-`{-~])/g;

interface Plain {
  text: string;
  /** Raw index of each plain char. */
  map: number[];
}

/** The text a reader sees: markup dropped, whitespace collapsed, each char mapped to its raw index. */
function plain(raw: string, source: boolean): Plain {
  const skip = new Uint8Array(raw.length);
  const mark = (re: RegExp): void => {
    for (const m of raw.matchAll(re)) skip.fill(1, m.index, m.index + m[0].length);
  };
  if (source) {
    mark(LINE_MARKERS);
    mark(LINK_TARGET);
    mark(ESCAPE);
  }
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charAt(i);
    if (skip[i] || INLINE_MARKUP.has(c)) continue;
    if (/\s/.test(c)) {
      if (text.endsWith(' ')) continue;
      text += ' ';
    } else {
      text += c;
    }
    map.push(i);
  }
  return { text, map };
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Replace the quote in `text` where prefix, quote and suffix read in sequence. The context may run
 * through markup; the replaced span itself must be the quote verbatim, whitespace aside.
 */
export function applyReplacement(
  text: string,
  target: Pick<TextTarget, 'quote' | 'prefix' | 'suffix'>,
  replacement: string,
): ReplaceResult {
  if (collapse(target.quote) === '') return { ok: false, reason: 'not-found' };
  const needle = plain(target.prefix + target.quote + target.suffix, false);
  const quoteFrom = target.prefix.length;
  const quoteTo = quoteFrom + target.quote.length;
  let qs = needle.map.findIndex((raw) => raw >= quoteFrom);
  let qe = needle.map.findIndex((raw) => raw >= quoteTo);
  if (qe < 0) qe = needle.text.length;
  if (needle.text.charAt(qs) === ' ' && qs < qe) qs++;
  if (needle.text.charAt(qe - 1) === ' ' && qe > qs) qe--;

  const hay = plain(text, true);
  const hits: number[] = [];
  for (let at = hay.text.indexOf(needle.text); at >= 0; at = hay.text.indexOf(needle.text, at + 1)) {
    hits.push(at);
  }
  if (hits.length === 0) return { ok: false, reason: 'not-found' };
  if (hits.length > 1) return { ok: false, reason: 'ambiguous' };

  const hit = hits[0] as number;
  const start = hay.map[hit + qs] as number;
  const end = (hay.map[hit + qe - 1] as number) + 1;
  if (collapse(text.slice(start, end)) !== collapse(target.quote)) return { ok: false, reason: 'formatted' };
  return { ok: true, text: text.slice(0, start) + replacement + text.slice(end), start, end };
}
