import type { Rect } from '@llm-ui-annotation/core';
import { computedStyles, describeSelector, docRect, elementLabelOf, roleOf } from './core-dom.js';

/** Below this the bands have no room for a number, so the box model is not drawn. */
export const MIN_BOX = 24;

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

export interface Inspection {
  name: string;
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

const px = (style: CSSStyleDeclaration, prop: string): number =>
  Number.parseFloat(style.getPropertyValue(prop)) || 0;

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

export const boxDrawable = (box: BoxModel): boolean =>
  box.borderBox.width >= MIN_BOX && box.borderBox.height >= MIN_BOX;

function readings(style: CSSStyleDeclaration, props: string[]): Reading[] {
  return props
    .map((prop): Reading => [prop, style.getPropertyValue(prop).trim()])
    .filter(([, value]) => !EMPTY.has(value));
}

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

function colourOf(style: CSSStyleDeclaration, box: BoxModel | null): Reading[] {
  const props = ['color', 'background-color', 'box-shadow'];
  if (box && hasSide(box.border)) props.splice(2, 0, 'border-color');
  return readings(style, props).filter(([, value]) => value !== 'rgba(0, 0, 0, 0)');
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
    colour: style ? colourOf(style, box) : [],
    styles: withStyles ? computedStyles(el) : null,
  };
}
