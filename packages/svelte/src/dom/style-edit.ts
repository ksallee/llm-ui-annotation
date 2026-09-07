import { parseColor } from '@llm-ui-annotation/core/theme';
import { normalizeValue, resolveTokens } from './core-dom.js';

/** What a value is, which decides the editor and the tokens offered for it. */
export type EditKind = 'length' | 'color' | 'shadow' | 'family' | 'free';

export interface Editable {
  property: string;
  group: string;
  kind: EditKind;
  /** Token names matching this are offered first: a spacing scale is not a type scale. */
  family?: RegExp;
}

/** The properties design feedback is about. Everything else stays read-only. */
export const EDITABLE: readonly Editable[] = [
  { property: 'padding', group: 'Spacing', kind: 'length', family: /space|spacing|gap|pad|size/ },
  { property: 'margin', group: 'Spacing', kind: 'length', family: /space|spacing|gap|margin|size/ },
  { property: 'gap', group: 'Spacing', kind: 'length', family: /space|spacing|gap|size/ },
  { property: 'color', group: 'Colour', kind: 'color', family: /ink|text|fg|foreground|color|colour/ },
  { property: 'background-color', group: 'Colour', kind: 'color', family: /bg|background|surface|ground|fill/ },
  { property: 'border-color', group: 'Colour', kind: 'color', family: /line|border|stroke|divider/ },
  { property: 'font-family', group: 'Type', kind: 'family', family: /font|family|sans|serif|mono/ },
  { property: 'font-size', group: 'Type', kind: 'length', family: /text|font|size/ },
  { property: 'font-weight', group: 'Type', kind: 'free', family: /weight|bold|font/ },
  { property: 'line-height', group: 'Type', kind: 'length', family: /leading|line/ },
  { property: 'letter-spacing', group: 'Type', kind: 'length', family: /tracking|letter/ },
  { property: 'text-transform', group: 'Type', kind: 'free' },
  { property: 'text-align', group: 'Type', kind: 'free' },
  { property: 'border-radius', group: 'Shape', kind: 'length', family: /radius|rounded|corner/ },
  { property: 'border-width', group: 'Shape', kind: 'length', family: /border|line|width/ },
  { property: 'box-shadow', group: 'Shape', kind: 'shadow', family: /shadow|elevation/ },
  { property: 'opacity', group: 'Shape', kind: 'free', family: /opacity|alpha/ },
];

const FAMILY = new Map(
  EDITABLE.flatMap((item) => (item.family ? [[item.property, item.family] as const] : [])),
);

/**
 * The token behind a value, when the page declares one and its name belongs to this property. A
 * value alone is ambiguous — a 10px radius and a 10px pad are the same string — so a name from the
 * wrong family is treated as a coincidence rather than reported as the source.
 *
 * @param fontPx the element's font size, the basis for its em and unitless values.
 */
export function namedToken(
  property: string,
  value: string,
  tokens: ReadonlyMap<string, string>,
  fontPx = 0,
): string | null {
  const found = resolveTokens({ [property]: value }, tokens, fontPx)[property];
  if (found === undefined) return null;
  const family = FAMILY.get(property);
  if (!family) return found;
  return found.split(' ').every((name) => family.test(name)) ? found : null;
}

export interface TokenOption {
  name: string;
  value: string;
}

const ONE_LENGTH = /^-?[\d.]+(px|rem|em|%)?$/;

/** What an arbitrary CSS value looks like, which is how a token finds the properties it fits. */
export function kindOf(value: string): EditKind {
  const v = value.trim();
  if (v === '') return 'free';
  const parts = v.split(/\s+/);
  if (parseColor(v) !== null) return 'color';
  if (parts.every((part) => ONE_LENGTH.test(part))) return 'length';
  if (/(px|rem|em)\b/.test(v) && parts.length >= 3) return 'shadow';
  if (!/\d/.test(v)) return 'family';
  return 'free';
}

/**
 * The page's tokens that fit this property: the ones named for it first, the rest after.
 *
 * @param declared every token in scope, by name — not `tokenMap`, which keeps one name per value.
 */
export function tokenOptions(
  declared: ReadonlyMap<string, string>,
  item: Editable,
): { fitting: TokenOption[]; others: TokenOption[] } {
  const fitting: TokenOption[] = [];
  const others: TokenOption[] = [];
  for (const [name, value] of declared) {
    if (item.kind !== 'free' && kindOf(value) !== item.kind) continue;
    (item.family?.test(name) ? fitting : others).push({ name, value });
  }
  const byName = (a: TokenOption, b: TokenOption): number => a.name.localeCompare(b.name);
  return { fitting: fitting.sort(byName), others: others.sort(byName) };
}

/** Computed values of the editable set, shorthand where the browser gives one. */
export function editableValues(el: Element): Record<string, string> {
  const view = el.ownerDocument.defaultView;
  if (!view) return {};
  const style = view.getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const { property } of EDITABLE) out[property] = style.getPropertyValue(property).trim();
  return out;
}

/** Two values are the same edit when they normalize the same, so `8px` never diffs against `8px `. */
export const sameValue = (a: string, b: string): boolean =>
  normalizeValue(a) === normalizeValue(b) || a.trim() === b.trim();
