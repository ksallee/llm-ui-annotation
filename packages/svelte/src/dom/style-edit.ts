import { parseColor } from '@llm-ui-annotation/core/theme';
import { normalizeValue, resolveDeclared, TOKEN_FAMILIES } from './core-dom.js';

/** What a value is, which decides the editor and the tokens offered for it. */
export type EditKind = 'length' | 'color' | 'shadow' | 'family' | 'free';

export interface Editable {
  property: string;
  group: string;
  kind: EditKind;
}

/** The properties worth proposing on an element whose source does not already set them. */
export const EDITABLE: readonly Editable[] = [
  { property: 'padding', group: 'Spacing', kind: 'length' },
  { property: 'padding-block', group: 'Spacing', kind: 'length' },
  { property: 'padding-inline', group: 'Spacing', kind: 'length' },
  { property: 'margin', group: 'Spacing', kind: 'length' },
  { property: 'margin-block', group: 'Spacing', kind: 'length' },
  { property: 'margin-inline', group: 'Spacing', kind: 'length' },
  { property: 'gap', group: 'Spacing', kind: 'length' },
  { property: 'color', group: 'Colour', kind: 'color' },
  { property: 'background', group: 'Colour', kind: 'color' },
  { property: 'background-color', group: 'Colour', kind: 'color' },
  { property: 'border-color', group: 'Colour', kind: 'color' },
  { property: 'font-family', group: 'Type', kind: 'family' },
  { property: 'font-size', group: 'Type', kind: 'length' },
  { property: 'font-weight', group: 'Type', kind: 'free' },
  { property: 'line-height', group: 'Type', kind: 'length' },
  { property: 'letter-spacing', group: 'Type', kind: 'length' },
  { property: 'text-transform', group: 'Type', kind: 'free' },
  { property: 'text-align', group: 'Type', kind: 'free' },
  { property: 'border-radius', group: 'Shape', kind: 'length' },
  { property: 'border-width', group: 'Shape', kind: 'length' },
  { property: 'box-shadow', group: 'Shape', kind: 'shadow' },
  { property: 'opacity', group: 'Shape', kind: 'free' },
];

const BY_PROPERTY = new Map(EDITABLE.map((item) => [item.property, item]));

/** The editor for a property, a plain field for anything else the page happens to set. */
export function editableFor(property: string): Editable {
  return BY_PROPERTY.get(property) ?? { property, group: 'Other', kind: 'free' };
}

/**
 * The token behind a value, or null. Family rules live in core: a property only ever matches a token
 * from its own family or from none, so a 10px pad is never reported as `--radius-lg`.
 *
 * @param declared every token in scope, by name, from `declaredTokens`.
 * @param fontPx the element's font size, the basis for its em and unitless values.
 */
export function namedToken(
  property: string,
  value: string,
  declared: ReadonlyMap<string, string>,
  fontPx = 0,
): string | null {
  return resolveDeclared({ [property]: value }, declared, fontPx)[property] ?? null;
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
  const family = TOKEN_FAMILIES[item.property];
  const fitting: TokenOption[] = [];
  const others: TokenOption[] = [];
  for (const [name, value] of declared) {
    const named = family?.test(name) ?? false;
    // A free value has no shape to match on, so only the name can vouch for the token.
    if (item.kind === 'free' ? !named : kindOf(value) !== item.kind) continue;
    (named ? fitting : others).push({ name, value });
  }
  const byName = (a: TokenOption, b: TokenOption): number => a.name.localeCompare(b.name);
  return { fitting: fitting.sort(byName), others: others.sort(byName) };
}

/** The tokens a value names, in order, or null when it names none. */
export function tokensIn(value: string): string | null {
  const names = [...value.matchAll(/var\(\s*(--[^\s,)]+)/g)].map((m) => m[1]);
  return names.length > 0 ? names.join(' ') : null;
}

/** Two values are the same edit when they normalize the same, so `8px` never diffs against `8px `. */
export const sameValue = (a: string, b: string): boolean =>
  normalizeValue(a) === normalizeValue(b) || a.trim() === b.trim();
