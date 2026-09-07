/** The host page's own custom properties, matched back onto computed values. */

import { formatOklch, parseColor } from '../theme/color.js';
import { ancestorChain } from './ancestors.js';

/** Normalized custom property value to property name, plus the stylesheets that could not be read. */
export interface TokenMap extends Map<string, string> {
  skipped: number;
}

const DEFAULT_ROOT_PX = 16;
const ALIAS_HOPS = 8;

const ROOTISH = /^(:root|html|body|\*)$/;
const ALIAS = /^var\(\s*(--[^\s,)]+)/;
const NUMBER = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/;
const TRAILING_ORIGINAL = /\s+\([^()]*\)$/;

const ABSOLUTE: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
  q: 96 / 101.6,
};

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * One shadow, lengths then colour, trailing zero lengths dropped. A page writes
 * `0 1px 2px rgba(…)` and the browser computes `rgba(…) 0px 1px 2px 0px`; both land here.
 */
function normalizeShadow(parts: string[], rootPx: number): string | null {
  const lengths: string[] = [];
  const rest: string[] = [];
  let colour: string | null = null;
  for (const part of parts) {
    const one = normalizeValue(part, rootPx);
    if (NUMBER.test(part)) lengths.push(one);
    else if (colour === null && parseColor(part)) colour = one;
    else rest.push(one);
  }
  if (colour === null || lengths.length < 2) return null;
  while (lengths.length > 2 && lengths[lengths.length - 1] === '0px') lengths.pop();
  return [...lengths, colour, ...rest].join(' ');
}

/** Compare-ready form of a declared or computed value: colors in oklch, absolute lengths in px. */
export function normalizeValue(value: string, rootPx = DEFAULT_ROOT_PX): string {
  let raw = value.trim();
  if (raw === '') return '';

  const head = raw.replace(TRAILING_ORIGINAL, '');
  if (head !== raw && parseColor(head)) raw = head;

  const color = parseColor(raw);
  if (color) return formatOklch(color);

  const parts = splitParts(raw);
  if (parts.length > 2) {
    const shadow = normalizeShadow(parts, rootPx);
    if (shadow !== null) return shadow;
  }

  const text = raw.toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');
  const m = NUMBER.exec(text);
  if (!m?.[1]) return text;

  const n = Number(m[1]);
  const unit = m[2] ?? '';
  if (unit === '') return n === 0 ? '0px' : String(round(n));
  if (unit === 'rem') return `${round(n * rootPx)}px`;
  const factor = ABSOLUTE[unit];
  return factor === undefined ? text : `${round(n * factor)}px`;
}

/** Split on whitespace outside parentheses, so `rgb(1, 2, 3)` stays whole. */
function splitParts(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth === 0 && /\s/.test(ch)) {
      if (current !== '') out.push(current);
      current = '';
    } else current += ch;
  }
  if (current !== '') out.push(current);
  return out;
}

interface Declaration {
  name: string;
  value: string;
  /** Steps from the annotated element to the element the rule matched; 0 is the element itself. */
  depth: number;
  order: number;
}

interface Collected {
  decls: Declaration[];
  skipped: number;
}

function depthOf(selector: string, chain: Element[] | null): number {
  if (!chain) {
    return selector.split(',').some((s) => ROOTISH.test(s.trim())) ? 0 : -1;
  }
  for (let i = 0; i < chain.length; i++) {
    const el = chain[i];
    if (!el) continue;
    try {
      if (el.matches(selector)) return i;
    } catch {
      return -1;
    }
  }
  return -1;
}

function conditionHolds(rule: CSSRule, view: (Window & typeof globalThis) | null): boolean {
  const media = (rule as CSSMediaRule).media;
  if (!media || !view?.matchMedia) return true;
  try {
    return view.matchMedia(media.mediaText).matches;
  } catch {
    return true;
  }
}

function customNames(style: CSSStyleDeclaration): string[] {
  const out: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    if (name.startsWith('--')) out.push(name);
  }
  return out;
}

function collectRules(
  rules: CSSRuleList,
  chain: Element[] | null,
  view: (Window & typeof globalThis) | null,
  into: Collected,
): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;

    const imported = (rule as CSSImportRule).styleSheet;
    if (imported) {
      collectSheet(imported, chain, view, into);
      continue;
    }

    const nested = (rule as CSSGroupingRule).cssRules;
    const { style, selectorText } = rule as CSSStyleRule;

    // Since CSS nesting, a browser gives every style rule a `cssRules` list of its own, so what
    // makes a rule a grouping rule is the missing selector, not the presence of the list.
    if (nested && selectorText === undefined) {
      if (conditionHolds(rule, view)) collectRules(nested, chain, view, into);
      continue;
    }
    if (nested && nested.length > 0) collectRules(nested, chain, view, into);

    if (!style || selectorText === undefined) continue;
    const names = customNames(style);
    if (names.length === 0) continue;

    const depth = depthOf(selectorText, chain);
    if (depth < 0) continue;
    for (const name of names) {
      into.decls.push({
        name,
        value: style.getPropertyValue(name).trim(),
        depth,
        order: into.decls.length,
      });
    }
  }
}

function collectSheet(
  sheet: CSSStyleSheet,
  chain: Element[] | null,
  view: (Window & typeof globalThis) | null,
  into: Collected,
): void {
  let rules: CSSRuleList | null = null;
  try {
    rules = sheet.cssRules;
  } catch {
    into.skipped += 1;
    return;
  }
  if (!rules) {
    into.skipped += 1;
    return;
  }
  collectRules(rules, chain, view, into);
}

/** The declaration that wins for each name: closest ancestor, then last in cascade order. */
function winners(decls: readonly Declaration[]): Map<string, Declaration> {
  const best = new Map<string, Declaration>();
  for (const d of decls) {
    const prev = best.get(d.name);
    if (!prev || d.depth < prev.depth || (d.depth === prev.depth && d.order > prev.order)) {
      best.set(d.name, d);
    }
  }
  return best;
}

function deref(best: Map<string, Declaration>, start: Declaration): string {
  let value = start.value;
  for (let i = 0; i < ALIAS_HOPS; i++) {
    const name = ALIAS.exec(value)?.[1];
    const next = name === undefined ? undefined : best.get(name);
    if (!next) return value;
    value = next.value;
  }
  return value;
}

function preferred(a: Declaration, b: Declaration): boolean {
  if (a.depth !== b.depth) return a.depth < b.depth;
  if (a.name.length !== b.name.length) return a.name.length < b.name.length;
  return a.name < b.name;
}

function rootFontSize(doc: Document): number {
  const view = doc.defaultView;
  if (!view) return DEFAULT_ROOT_PX;
  try {
    const style = view.getComputedStyle(doc.documentElement);
    const size = Number.parseFloat(style.getPropertyValue('font-size'));
    return Number.isFinite(size) && size > 0 ? size : DEFAULT_ROOT_PX;
  } catch {
    return DEFAULT_ROOT_PX;
  }
}

/** The winning declaration per name, with the sheets that could not be read. */
function collect(doc: Document, el?: Element): { best: Map<string, Declaration>; skipped: number } {
  const view = doc.defaultView;
  const chain = el ? ancestorChain(el) : null;
  const into: Collected = { decls: [], skipped: 0 };
  const sheets = doc.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (sheet) collectSheet(sheet, chain, view, into);
  }
  return { best: winners(into.decls), skipped: into.skipped };
}

/**
 * Custom properties the page declares, keyed by value, one name per value. `el` scopes them to its
 * own ancestry. Two tokens sharing a value keep the shallower, then the shorter name.
 */
export function tokenMap(doc: Document, el?: Element): TokenMap {
  const { best, skipped } = collect(doc, el);
  const rootPx = rootFontSize(doc);
  const chosen = new Map<string, Declaration>();
  const map = new Map<string, string>();
  for (const d of best.values()) {
    const key = normalizeValue(deref(best, d), rootPx);
    if (key === '') continue;
    const prev = chosen.get(key);
    if (prev && !preferred(d, prev)) continue;
    chosen.set(key, d);
    map.set(key, d.name);
  }
  return Object.assign(map, { skipped });
}

/**
 * Every custom property in scope, keyed by name. Unlike `tokenMap` nothing is dropped for sharing a
 * value, which is what an editor offering the page's tokens needs.
 */
export function declaredTokens(doc: Document, el?: Element): Map<string, string> {
  const { best } = collect(doc, el);
  const rootPx = rootFontSize(doc);
  // Winning order — closest ancestor, then shortest name — so a consumer keeping the first entry
  // for a value keeps the one the cascade favours.
  const ranked = [...best.values()].sort((a, b) => (preferred(a, b) ? -1 : 1));
  const out = new Map<string, string>();
  for (const d of ranked) {
    const value = normalizeValue(deref(best, d), rootPx);
    if (value !== '') out.set(d.name, value);
  }
  return out;
}

function matchValue(value: string, map: ReadonlyMap<string, string>): string | undefined {
  const whole = map.get(normalizeValue(value));
  if (whole !== undefined) return whole;

  const parts = splitParts(value);
  if (parts.length < 2) return undefined;
  const names: string[] = [];
  for (const part of parts) {
    const name = map.get(normalizeValue(part));
    if (name === undefined) return undefined;
    names.push(name);
  }
  return names.join(' ');
}

/** Property to the custom property that produced it. A multi-part value resolves only in full. */
/** Properties a page writes against its own font size, and the unit their tokens are written in. */
const RELATIVE: Record<string, 'ratio' | 'em'> = {
  'line-height': 'ratio',
  'letter-spacing': 'em',
};

/** The same value as the page declared it: `41.4px` of line-height is `1.15` on a 36px font. */
function asDeclared(prop: string, value: string, fontPx: number): string | null {
  const unit = RELATIVE[prop];
  const px = Number.parseFloat(value);
  if (unit === undefined || fontPx <= 0 || !Number.isFinite(px) || !value.endsWith('px')) return null;
  const ratio = round(px / fontPx);
  return unit === 'ratio' ? String(ratio) : `${ratio}em`;
}

export function resolveTokens(
  styles: Record<string, string>,
  map: ReadonlyMap<string, string>,
  fontPx = 0,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    // The relative form first: a 24px line-height on a 15px font is the `1.6` the page wrote, and
    // only coincidentally the value of a spacing token.
    const name = matchRelative(prop, value, map, fontPx) ?? matchValue(value, map);
    if (name !== undefined) out[prop] = name;
  }
  return out;
}

/**
 * How a design system names the tokens of a property. Values collide across families — a 8px pad and
 * an 8px radius are the same string — so the name is the only thing that says which one produced it.
 */
export const TOKEN_FAMILIES: Readonly<Record<string, RegExp>> = {
  padding: /space|spacing|gap|pad|size/,
  margin: /space|spacing|gap|margin|size/,
  gap: /space|spacing|gap|size/,
  'row-gap': /space|spacing|gap|size/,
  'column-gap': /space|spacing|gap|size/,
  color: /ink|text|fg|foreground|color|colour/,
  background: /bg|background|surface|ground|fill/,
  'background-color': /bg|background|surface|ground|fill/,
  'border-color': /line|border|stroke|divider/,
  'font-family': /font|family|sans|serif|mono/,
  'font-size': /text|font|size/,
  'font-weight': /weight|bold|font/,
  'line-height': /leading|line/,
  'letter-spacing': /tracking|letter/,
  'border-radius': /radius|rounded|corner/,
  'border-width': /border|line|width/,
  'box-shadow': /shadow|elevation/,
  opacity: /opacity|alpha/,
};

const FAMILIES = [...new Set(Object.values(TOKEN_FAMILIES))];

/**
 * Whether a name may stand for this property: its own family, or no family at all — `--brand` says
 * nothing about which property it is for, while `--space-2` says it is not a radius.
 */
function suits(name: string, family: RegExp | undefined): boolean {
  if (family?.test(name)) return true;
  return !FAMILIES.some((other) => other !== family && other.test(name));
}

const SIDE = /-(top|right|bottom|left|block|inline)(?=-|$)/g;

/** `padding-inline` is padding, `border-top-left-radius` is border-radius: same family, same tokens. */
const familyOf = (property: string): RegExp | undefined =>
  TOKEN_FAMILIES[property] ?? TOKEN_FAMILIES[property.replace(SIDE, '')];

/** Value to name, the first suitable name per value. `declared` is already in winning order. */
function familyMap(declared: ReadonlyMap<string, string>, family: RegExp | undefined): TokenMap {
  const out = new Map<string, string>();
  for (const [name, value] of declared) {
    if (suits(name, family) && !out.has(value)) out.set(value, name);
  }
  return Object.assign(out, { skipped: 0 });
}

/**
 * Property to the token that produced it, resolved against every declared name rather than one name
 * per value: a property only ever matches a token from its own family, so an 8px radius is reported
 * as the radius token and not as the spacing token that happens to share the value.
 *
 * @param declared every custom property in scope, by name, from `declaredTokens`.
 * @param fontPx the element's font size, the basis for its em and unitless values.
 */
export function resolveDeclared(
  styles: Record<string, string>,
  declared: ReadonlyMap<string, string>,
  fontPx = 0,
): Record<string, string> {
  const maps = new Map<RegExp | undefined, TokenMap>();
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    const family = familyOf(prop);
    let map = maps.get(family);
    if (!map) maps.set(family, (map = familyMap(declared, family)));
    const found = resolveTokens({ [prop]: value }, map, fontPx)[prop];
    if (found !== undefined) out[prop] = found;
  }
  return out;
}

function matchRelative(
  prop: string,
  value: string,
  map: ReadonlyMap<string, string>,
  fontPx: number,
): string | undefined {
  const declared = asDeclared(prop, value, fontPx);
  return declared === null ? undefined : matchValue(declared, map);
}
