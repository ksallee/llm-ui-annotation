// What the inspector and the hover card read off one element: its box model, the computed values
// worth showing, and the devtools-style card.

import type { Rect } from '@llm-ui-annotation/core';
import { contrast } from '@llm-ui-annotation/core/theme';
import {
  computedStyles,
  describeSelector,
  docRect,
  elementLabelOf,
  labelOf,
  roleOf,
} from './core-dom.js';
import { namedToken } from './style-edit.js';

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoxModel {
  margin: Sides;
  border: Sides;
  padding: Sides;
  marginBox: Rect;
  borderBox: Rect;
  paddingBox: Rect;
  contentBox: Rect;
}

/** One `name: value` line in the inspector. */
export type Reading = [name: string, value: string];

/** `div#main.card.wide`, the way devtools titles a node. */
export interface NodeLabel {
  tag: string;
  id: string;
  classes: string[];
}

/** One row of the hover card. `swatch` is a CSS colour when the value is one. */
export interface CardRow {
  name: string;
  value: string;
  swatch: string | null;
  /** The custom property the page declares for this value, when there is one. */
  token: string | null;
}

export interface ElementCard {
  label: NodeLabel;
  size: string;
  rows: CardRow[];
  a11y: CardRow[];
}

export interface Inspection {
  name: string;
  /** The element's font size in px, the basis for its em and unitless values. */
  fontPx: number;
  label: NodeLabel;
  a11y: CardRow[];
  selector: string;
  role: string | null;
  tag: string;
  /** From `body` down to the element. */
  chain: string[];
  box: BoxModel | null;
  layout: Reading[];
  type: Reading[];
  colour: Reading[];
  /** The subset the annotation carries, or null when the detail level sends none. */
  styles: Record<string, string> | null;
}

const EMPTY = new Set(['', 'none', 'normal', 'auto']);
const TRANSPARENT = new Set(['transparent', 'rgba(0, 0, 0, 0)']);
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [contenteditable]';
// Svelte's scoping hash is a build artifact; devtools shows it, but it says nothing about the page.
const SCOPED = /^(s|svelte)-[a-z0-9]{6,}$/i;

const px = (style: CSSStyleDeclaration, prop: string): number =>
  Number.parseFloat(style.getPropertyValue(prop)) || 0;

const row = (
  name: string,
  value: string,
  swatch: string | null = null,
  token: string | null = null,
): CardRow => ({ name, value, swatch, token });

function readings(style: CSSStyleDeclaration, props: string[]): Reading[] {
  return props
    .map((prop): Reading => [prop, style.getPropertyValue(prop).trim()])
    .filter(([, value]) => !EMPTY.has(value));
}

/** The colour actually behind the element: the first ancestor that paints one. */
function backdrop(el: Element): string | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  for (let current: Element | null = el; current; current = current.parentElement) {
    const value = view.getComputedStyle(current).getPropertyValue('background-color').trim();
    if (!TRANSPARENT.has(value)) return value;
  }
  return null;
}

/** The background the eye reads: the element's own, or what shows through when it is transparent. */
function paintedBackground(el: Element, style: CSSStyleDeclaration): string | null {
  const own = style.getPropertyValue('background-color').trim();
  return TRANSPARENT.has(own) ? backdrop(el) : own;
}

// ------------------------------------------------------------------- box model

const sidesOf = (style: CSSStyleDeclaration, prefix: string, suffix = ''): Sides => ({
  top: px(style, `${prefix}-top${suffix}`),
  right: px(style, `${prefix}-right${suffix}`),
  bottom: px(style, `${prefix}-bottom${suffix}`),
  left: px(style, `${prefix}-left${suffix}`),
});

export const hasSide = (sides: Sides): boolean =>
  sides.top !== 0 || sides.right !== 0 || sides.bottom !== 0 || sides.left !== 0;

function inset(rect: Rect, by: Sides): Rect {
  return {
    x: rect.x + by.left,
    y: rect.y + by.top,
    width: Math.max(0, rect.width - by.left - by.right),
    height: Math.max(0, rect.height - by.top - by.bottom),
  };
}

const outset = (rect: Rect, by: Sides): Rect =>
  inset(rect, { top: -by.top, right: -by.right, bottom: -by.bottom, left: -by.left });

/** Content, padding, border and margin boxes in document coordinates. */
export function boxModel(el: Element): BoxModel | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  const style = view.getComputedStyle(el);
  const margin = sidesOf(style, 'margin');
  const border = sidesOf(style, 'border', '-width');
  const padding = sidesOf(style, 'padding');
  const borderBox = docRect(el);
  const paddingBox = inset(borderBox, border);
  return {
    margin,
    border,
    padding,
    marginBox: outset(borderBox, margin),
    borderBox,
    paddingBox,
    contentBox: inset(paddingBox, padding),
  };
}

/** CSS shorthand: one value when the sides agree, then the vertical/horizontal pair, then four. */
export function shorthand(sides: Sides): string {
  const { top, right, bottom, left } = sides;
  const length = (n: number): string => `${Math.round(n * 100) / 100}px`;
  if (top === right && right === bottom && bottom === left) return length(top);
  if (top === bottom && left === right) return `${length(top)} ${length(right)}`;
  if (left === right) return `${length(top)} ${length(right)} ${length(bottom)}`;
  return `${length(top)} ${length(right)} ${length(bottom)} ${length(left)}`;
}

// ----------------------------------------------------------------- the card

const hasOwnText = (el: Element): boolean =>
  Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue ?? '').trim() !== '');

const focusable = (el: Element): boolean =>
  el.matches(FOCUSABLE) ? !el.hasAttribute('disabled') : (el as HTMLElement).tabIndex >= 0;

/** The devtools accessibility block: what the element is called, what it is, and whether Tab reaches it. */
function a11yRows(el: Element): CardRow[] {
  return [
    row('Name', labelOf(el) || '—'),
    row('Role', roleOf(el) ?? 'generic'),
    row('Keyboard-focusable', focusable(el) ? '✓' : '✗'),
  ];
}

function nodeLabel(el: Element): NodeLabel {
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id,
    classes: Array.from(el.classList).filter((name) => !SCOPED.test(name)),
  };
}

/** `rgb(31, 41, 55)` as `#1f2937`; anything else, including alpha, is left alone. */
export function hexOf(css: string): string {
  const parts = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/.exec(css.trim());
  if (!parts) return css;
  const hex = parts
    .slice(1)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

/** What devtools puts in the tooltip over the element it is highlighting. */
export function elementCard(el: Element, tokens?: ReadonlyMap<string, string>): ElementCard | null {
  const view = el.ownerDocument.defaultView;
  const box = boxModel(el);
  if (!view || !box) return null;
  const style = view.getComputedStyle(el);
  const read = (prop: string): string => style.getPropertyValue(prop).trim();
  const fontPx = Number.parseFloat(read('font-size')) || 0;
  const named = (prop: string, value: string): string | null =>
    tokens ? namedToken(prop, value, tokens, fontPx) : null;

  const colour = read('color');
  const family = read('font-family').split(',')[0]?.replace(/["']/g, '').trim() ?? '';
  const behind = paintedBackground(el, style);
  const shadow = read('box-shadow');
  const gap = read('gap');
  const size = read('font-size');

  const rows = [
    row('Color', hexOf(colour), colour, named('color', colour)),
    row('Font', `${size} ${family}`, null, named('font-size', size)),
  ];
  if (behind) rows.push(row('Background', hexOf(behind), behind, named('background-color', behind)));
  if (!EMPTY.has(shadow)) rows.push(row('Shadow', shadow, null, named('box-shadow', shadow)));
  rows.push(
    row('Margin', shorthand(box.margin), null, named('margin', shorthand(box.margin))),
    row('Padding', shorthand(box.padding), null, named('padding', shorthand(box.padding))),
  );
  if (/flex|grid/.test(read('display')) && !EMPTY.has(gap)) {
    rows.push(row('Gap', gap, null, named('gap', gap)));
  }
  rows.push(row('Border', shorthand(box.border), null, named('border-width', shorthand(box.border))));

  if (behind && hasOwnText(el)) {
    const ratio = contrast(colour, behind);
    rows.push(row('Contrast', `${ratio.toFixed(2)} ${ratio >= 4.5 ? '✓' : '✗'} AA`));
  }

  return {
    label: nodeLabel(el),
    size: `${Math.round(box.borderBox.width)} × ${Math.round(box.borderBox.height)}`,
    rows,
    a11y: a11yRows(el),
  };
}

// ------------------------------------------------------------- the inspector

function layoutOf(style: CSSStyleDeclaration): Reading[] {
  const display = style.getPropertyValue('display').trim();
  const out: Reading[] = [
    ['display', display],
    ['position', style.getPropertyValue('position').trim()],
  ];
  if (display.includes('flex')) {
    out.push(...readings(style, ['flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'gap']));
  }
  if (display.includes('grid')) {
    out.push(
      ...readings(style, [
        'grid-template-columns',
        'grid-template-rows',
        'align-items',
        'justify-content',
        'gap',
      ]),
    );
  }
  return out.filter(([, value]) => value !== '');
}

function colourOf(el: Element, style: CSSStyleDeclaration, box: BoxModel | null): Reading[] {
  const props = ['color', 'box-shadow'];
  if (box && hasSide(box.border)) props.splice(1, 0, 'border-color');
  const out = readings(style, props).filter(([, value]) => value !== 'rgba(0, 0, 0, 0)');
  const background = paintedBackground(el, style);
  if (background) out.splice(1, 0, ['background-color', background]);
  return out;
}

/** Ancestor tags from `body` down, piercing open shadow roots. */
function chainOf(el: Element): string[] {
  const out: string[] = [];
  for (let current: Element | null = el; current; ) {
    out.unshift(current.tagName.toLowerCase());
    if (current.tagName === 'BODY') break;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return out;
}

/** Everything the inspector shows about one element. `styles` is what the annotation would carry. */
export function inspectElement(el: Element, withStyles: boolean): Inspection {
  const view = el.ownerDocument.defaultView;
  const style = view?.getComputedStyle(el) ?? null;
  const box = boxModel(el);
  return {
    name: elementLabelOf(el),
    fontPx: style ? Number.parseFloat(style.getPropertyValue('font-size')) || 0 : 0,
    label: nodeLabel(el),
    a11y: a11yRows(el),
    selector: describeSelector(el).selector,
    role: roleOf(el),
    tag: el.tagName.toLowerCase(),
    chain: chainOf(el),
    box,
    layout: style ? layoutOf(style) : [],
    type: style
      ? readings(style, [
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'letter-spacing',
          'color',
        ])
      : [],
    colour: style ? colourOf(el, style, box) : [],
    styles: withStyles ? computedStyles(el) : null,
  };
}
