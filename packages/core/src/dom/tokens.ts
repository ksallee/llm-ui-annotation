import { formatOklch, parseColor } from '../theme/color.js';

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

/** Compare-ready form of a declared or computed value: colors in oklch, absolute lengths in px. */
export function normalizeValue(value: string, rootPx = DEFAULT_ROOT_PX): string {
  let raw = value.trim();
  if (raw === '') return '';

  const head = raw.replace(TRAILING_ORIGINAL, '');
  if (head !== raw && parseColor(head)) raw = head;

  const color = parseColor(raw);
  if (color) return formatOklch(color);

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

function ancestorChain(el: Element): Element[] {
  const out: Element[] = [];
  let current: Element | null = el;
  while (current) {
    out.push(current);
    const root = current.getRootNode();
    current = current.parentElement ?? (root.nodeType === 11 ? (root as ShadowRoot).host : null);
  }
  return out;
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

/** Custom properties the page declares, keyed by value. `el` scopes them to its own ancestry. */
export function tokenMap(doc: Document, el?: Element): TokenMap {
  const view = doc.defaultView;
  const chain = el ? ancestorChain(el) : null;
  const into: Collected = { decls: [], skipped: 0 };
  const sheets = doc.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (sheet) collectSheet(sheet, chain, view, into);
  }

  const rootPx = rootFontSize(doc);
  const best = winners(into.decls);
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
  return Object.assign(map, { skipped: into.skipped });
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
export function resolveTokens(
  styles: Record<string, string>,
  map: ReadonlyMap<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    const name = matchValue(value, map);
    if (name !== undefined) out[prop] = name;
  }
  return out;
}
