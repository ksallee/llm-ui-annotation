import { parseColor } from '@llm-ui-annotation/core/theme';
import { normalizeValue, tokenMap } from './core-dom.js';

/** What a value is, which decides the editor and the tokens offered for it. */
export type EditKind = 'length' | 'color' | 'shadow' | 'family' | 'free';

export interface Editable {
  property: string;
  group: string;
  kind: EditKind;
}

/** The properties design feedback is about. Everything else stays read-only. */
export const EDITABLE: readonly Editable[] = [
  { property: 'padding', group: 'Spacing', kind: 'length' },
  { property: 'margin', group: 'Spacing', kind: 'length' },
  { property: 'gap', group: 'Spacing', kind: 'length' },
  { property: 'color', group: 'Colour', kind: 'color' },
  { property: 'background-color', group: 'Colour', kind: 'color' },
  { property: 'border-color', group: 'Colour', kind: 'color' },
  { property: 'font-family', group: 'Type', kind: 'family' },
  { property: 'font-size', group: 'Type', kind: 'length' },
  { property: 'font-weight', group: 'Type', kind: 'free' },
  { property: 'line-height', group: 'Type', kind: 'length' },
  { property: 'border-radius', group: 'Shape', kind: 'length' },
  { property: 'box-shadow', group: 'Shape', kind: 'shadow' },
];

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

/** The page's own custom properties whose value fits `kind`, sorted by name. */
export function tokenOptions(doc: Document, el: Element, kind: EditKind): TokenOption[] {
  if (kind === 'free') return [];
  const out: TokenOption[] = [];
  for (const [value, name] of tokenMap(doc, el)) {
    if (kindOf(value) === kind) out.push({ name, value });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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
