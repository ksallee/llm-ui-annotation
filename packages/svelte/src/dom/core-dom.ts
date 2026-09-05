// TODO(ws-02): the single import site for `@llm-ui-annotation/core/dom`. When WS 02 lands, replace
// the body of this file with `export * from '@llm-ui-annotation/core/dom';`. Everything here is a
// working-but-shallow stand-in for the algorithms in docs/specs/02-core-algorithms.md.

import type { ElementRef, Rect, Stroke, TextTarget } from '@llm-ui-annotation/core';

export interface DescribeOptions {
  styles?: boolean;
  context?: boolean;
  preferAttrs?: string[];
  ignore?: (el: Element) => boolean;
}

export const OVERLAY_TAG = 'annot-overlay';

const UNSTABLE_CLASS =
  /^(svelte-[a-z0-9]+|css-[a-z0-9]+|sc-|_[a-z0-9]{5,}|[a-z]+-[0-9a-f]{5,}$|[A-Za-z]+__[a-z0-9]{5,})/;
const UTILITY_CLASS =
  /^(p|m|px|py|mx|my|w|h|gap|text|bg|flex|grid|items|justify|rounded|border|shadow|font|leading|tracking)-/;
const GENERATED_ID = /^(svelte-|radix-|headlessui-|:r|_|__)|[0-9a-f]{6,}/;
const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'dd', 'dt', 'figcaption', 'summary',
]);
const TEST_ATTRS = ['data-annot-id', 'data-testid', 'data-test', 'data-cy'];

const IMPLICIT_ROLE: Record<string, string> = {
  button: 'button', nav: 'navigation', main: 'main', img: 'img', ul: 'list', ol: 'list',
  li: 'listitem', table: 'table', th: 'columnheader', td: 'cell', form: 'form',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  textarea: 'textbox', select: 'combobox', a: 'link',
};

export const isOverlay = (node: Node | null): boolean => {
  let el: Node | null = node;
  while (el) {
    if (el instanceof Element && el.tagName.toLowerCase() === OVERLAY_TAG) return true;
    el = el.parentNode ?? (el instanceof ShadowRoot ? el.host : null);
  }
  return false;
};

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

function scrollOf(el: Element): { x: number; y: number } {
  const view = el.ownerDocument.defaultView;
  return { x: view?.scrollX ?? 0, y: view?.scrollY ?? 0 };
}

/** Client rect in document coordinates, rounded. */
export function docRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  const s = scrollOf(el);
  return {
    x: Math.round(r.left + s.x),
    y: Math.round(r.top + s.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

const escapeValue = (value: string): string => value.replace(/["\\]/g, '\\$&');

function stableClasses(el: Element): string[] {
  return [...el.classList]
    .filter(
      (c) =>
        c.length <= 40 &&
        !UNSTABLE_CLASS.test(c) &&
        !UTILITY_CLASS.test(c) &&
        !c.includes(':') &&
        !c.includes('[') &&
        !c.includes('/'),
    )
    .slice(0, 2);
}

function candidates(el: Element, prefer: string[]): string[] {
  const tag = el.tagName.toLowerCase();
  const out: string[] = [];
  const id = el.getAttribute('id');
  if (id && !GENERATED_ID.test(id)) out.push(`#${CSS.escape(id)}`);
  for (const attr of [...prefer, ...TEST_ATTRS]) {
    const value = el.getAttribute(attr);
    if (value) out.push(`[${attr}="${escapeValue(value)}"]`);
  }
  for (const attr of ['name', 'aria-label', 'alt', 'placeholder']) {
    const value = el.getAttribute(attr);
    if (value) out.push(`${tag}[${attr}="${escapeValue(value)}"]`);
  }
  const href = el.getAttribute('href');
  if (href) out.push(`${tag}[href="${escapeValue(href)}"]`);
  const classes = stableClasses(el);
  if (classes.length > 0) out.push(`${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`);
  return out;
}

function nthOfType(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const same = [...parent.children].filter((c) => c.tagName === el.tagName);
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag;
}

function unique(root: Document | ShadowRoot | Element, selector: string, el: Element): boolean {
  try {
    const found = root.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

function selectorsFor(el: Element, prefer: string[]): string[] {
  const rootNode = el.getRootNode();
  const root = (rootNode instanceof Document || rootNode instanceof ShadowRoot ? rootNode : el.ownerDocument) as
    | Document
    | ShadowRoot;
  const found: string[] = [];

  for (const c of candidates(el, prefer)) {
    if (unique(root, c, el) && !found.includes(c)) found.push(c);
  }

  let node: Element | null = el;
  let path = '';
  let depth = 0;
  while (node && depth < 6) {
    path = path ? `${nthOfType(node)} > ${path}` : nthOfType(node);
    const parent: Element | null = node.parentElement;
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
    for (const c of candidates(parent, prefer)) {
      const scoped = `${c} > ${path}`;
      if (unique(root, scoped, el) && !found.includes(scoped)) found.push(scoped);
    }
    node = parent;
    depth++;
  }
  const full = `body ${path ? `> ${path}` : ''}`.trim();
  if (!found.includes(full)) found.push(full);

  const host = rootNode instanceof ShadowRoot ? rootNode.host : null;
  if (host) {
    const outer = selectorsFor(host, prefer)[0] ?? host.tagName.toLowerCase();
    return found.map((inner) => `${outer} >>> ${inner}`);
  }
  return found;
}

function labelText(el: Element): string {
  const doc = el.ownerDocument;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const target = doc.getElementById(labelledBy);
    if (target?.textContent) return collapse(target.textContent);
  }
  const id = el.getAttribute('id');
  if (id) {
    const label = doc.querySelector(`label[for="${escapeValue(id)}"]`);
    if (label?.textContent) return collapse(label.textContent);
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return collapse(wrapping.textContent);
  return '';
}

/** Human label: `button "Save"`. */
export function elementName(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = ['aria-label', 'alt', 'title', 'placeholder'];
  let label = el.getAttribute('aria-label') ?? '';
  if (!label) label = labelText(el);
  if (!label) label = collapse(el.textContent ?? '').slice(0, 40);
  if (!label) {
    for (const a of attrs) {
      const value = el.getAttribute(a);
      if (value) {
        label = value;
        break;
      }
    }
  }
  if (!label && el instanceof HTMLInputElement) label = el.value;
  if (!label && el instanceof HTMLAnchorElement) {
    label = el.getAttribute('href')?.split('/').filter(Boolean).pop() ?? '';
  }
  if (!label && el.querySelector('svg')) return `${tag} (icon)`;
  return label ? `${tag} "${label}"` : tag;
}

function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return type;
    if (type === 'button' || type === 'submit') return 'button';
    return 'textbox';
  }
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
  return IMPLICIT_ROLE[tag] ?? null;
}

function attrsOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of el.attributes) {
    const keep =
      ['id', 'class', 'name', 'type', 'href', 'src', 'alt', 'title', 'placeholder', 'role'].includes(
        attr.name,
      ) ||
      attr.name.startsWith('aria-') ||
      attr.name.startsWith('data-');
    if (keep) out[attr.name] = attr.value.slice(0, 100);
  }
  return out;
}

const TEXT_STYLES = [
  'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
];
const BOX_STYLES = [
  'display', 'position', 'padding', 'margin', 'border-radius', 'background-color', 'box-shadow',
  'opacity', 'gap',
];
const FLOW_STYLES = ['flex-direction', 'align-items', 'justify-content', 'grid-template-columns'];

function stylesOf(el: Element): Record<string, string> {
  const view = el.ownerDocument.defaultView;
  if (!view?.getComputedStyle) return {};
  const cs = view.getComputedStyle(el);
  const out: Record<string, string> = {};
  const wanted = [...TEXT_STYLES, ...BOX_STYLES];
  if (cs.display === 'flex' || cs.display === 'grid') wanted.push(...FLOW_STYLES);
  for (const prop of wanted) {
    const value = cs.getPropertyValue(prop).trim();
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px') {
      out[prop] = value;
    }
    if (Object.keys(out).length >= 20) break;
  }
  return out;
}

/** Everything the agent gets about one element. */
export function describeElement(el: Element, opts: DescribeOptions = {}): ElementRef {
  const prefer = opts.preferAttrs ?? [];
  const all = selectorsFor(el, prefer);
  const [selector = el.tagName.toLowerCase(), ...fallbacks] = all;
  const ref: ElementRef = {
    selector,
    fallbacks: fallbacks.slice(0, 4),
    tag: el.tagName.toLowerCase(),
    role: roleOf(el),
    name: elementName(el),
    text: collapse(el.textContent ?? '').slice(0, 200),
    rect: docRect(el),
    fixed: isFixed(el),
    attrs: attrsOf(el),
  };
  if (opts.styles !== false) ref.styles = stylesOf(el);
  if (opts.context !== false) {
    ref.context = {
      parent: el.parentElement ? elementName(el.parentElement) : null,
      prev: el.previousElementSibling ? elementName(el.previousElementSibling) : null,
      next: el.nextElementSibling ? elementName(el.nextElementSibling) : null,
    };
  }
  return ref;
}

function isFixed(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view?.getComputedStyle) return false;
  let node: Element | null = el;
  while (node) {
    const position = view.getComputedStyle(node).position;
    if (position === 'fixed' || position === 'sticky') return true;
    node = node.parentElement;
  }
  return false;
}

/** Resolve a selector, crossing open shadow roots on `>>>`. */
export function resolveSelector(root: Document | ShadowRoot | Element, selector: string): Element | null {
  const parts = selector.split('>>>').map((p) => p.trim());
  let scope: Document | ShadowRoot | Element = root;
  let found: Element | null = null;
  for (const part of parts) {
    try {
      found = scope.querySelector(part);
    } catch {
      return null;
    }
    if (!found) return null;
    scope = found.shadowRoot ?? found;
  }
  return found;
}

const area = (r: Rect): number => Math.max(0, r.width) * Math.max(0, r.height);

function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.min(a.x + a.width, b.x + b.width) - x,
    height: Math.min(a.y + a.height, b.y + b.height) - y,
  };
}

export interface RectSearchOptions {
  minCoverage?: number;
  max?: number;
  styles?: boolean;
}

/** Elements meaningfully covered by `rect`, largest coverage first. */
export function findElementsInRect(
  doc: Document,
  rect: Rect,
  opts: RectSearchOptions = {},
): ElementRef[] {
  const min = opts.minCoverage ?? 0.3;
  const max = opts.max ?? 12;
  const regionArea = area(rect);
  const scored: { el: Element; covered: number }[] = [];

  for (const el of doc.body?.querySelectorAll('*') ?? []) {
    if (isOverlay(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'br') continue;
    const r = docRect(el);
    if (r.width < 8 || r.height < 8) continue;
    if (area(r) > regionArea * 4) continue;
    const covered = area(intersection(r, rect));
    if (covered <= 0 || covered / area(r) < min) continue;
    scored.push({ el, covered });
  }

  scored.sort((a, b) => b.covered - a.covered);
  const kept: { el: Element; covered: number }[] = [];
  for (const entry of scored) {
    const swallowed = kept.some(
      (k) => entry.el.contains(k.el) && k.covered >= entry.covered * 0.8,
    );
    if (!swallowed) kept.push(entry);
    if (kept.length >= max) break;
  }
  return kept.map((k) => describeElement(k.el, { styles: opts.styles ?? false, context: false }));
}

/** Collapse whitespace and keep a map back to raw offsets. */
export function normalize(text: string): { text: string; map: (i: number) => number } {
  const out: string[] = [];
  const back: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (out.length > 0 && !space) {
        out.push(' ');
        back.push(i);
        space = true;
      }
      continue;
    }
    space = false;
    out.push(ch);
    back.push(i);
  }
  while (out.length > 0 && out.at(-1) === ' ') {
    out.pop();
    back.pop();
  }
  return {
    text: out.join(''),
    map: (i: number) => back[Math.min(Math.max(i, 0), back.length - 1)] ?? 0,
  };
}

function blockAncestor(node: Node | null): Element | null {
  let el: Element | null = node instanceof Element ? node : (node?.parentElement ?? null);
  while (el && el.tagName !== 'BODY') {
    const view = el.ownerDocument.defaultView;
    const display = view?.getComputedStyle ? view.getComputedStyle(el).display : '';
    if (BLOCK_TAGS.has(el.tagName.toLowerCase()) || ['block', 'list-item', 'table-cell'].includes(display)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function rawOffsetIn(container: Element, node: Node, offset: number): number {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
}

function positionAt(container: Element, rawOffset: number): { node: Text; offset: number } | null {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let last: Text | null = null;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const len = current.textContent?.length ?? 0;
    if (rawOffset <= total + len) return { node: current, offset: rawOffset - total };
    total += len;
    last = current;
    current = walker.nextNode() as Text | null;
  }
  return last ? { node: last, offset: last.length } : null;
}

/** A `TextTarget` for a range inside one block, or a refusal reason. */
export function describeRange(
  range: Range,
  opts: DescribeOptions = {},
): { target: TextTarget } | { reason: 'multi-block' | 'empty' } {
  if (range.collapsed) return { reason: 'empty' };
  const container = blockAncestor(range.commonAncestorContainer);
  if (!container) return { reason: 'multi-block' };
  const startBlock = blockAncestor(range.startContainer);
  const endBlock = blockAncestor(range.endContainer);
  if (startBlock !== endBlock) return { reason: 'multi-block' };

  const raw = container.textContent ?? '';
  const norm = normalize(raw);
  const rawStart = rawOffsetIn(container, range.startContainer, range.startOffset);
  const rawEnd = rawOffsetIn(container, range.endContainer, range.endOffset);
  const start = normIndexOf(norm, rawStart);
  const end = normIndexOf(norm, rawEnd);
  const quote = collapse(range.toString());
  if (!quote) return { reason: 'empty' };

  return {
    target: {
      kind: 'text',
      container: describeElement(container, { styles: false, ...opts }),
      quote,
      prefix: norm.text.slice(Math.max(0, start - 32), start),
      suffix: norm.text.slice(end, end + 32),
      start,
      end,
      rects: rangeRects(range),
    },
  };
}

function normIndexOf(norm: { text: string; map: (i: number) => number }, rawOffset: number): number {
  let lo = 0;
  let hi = norm.text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (norm.map(mid) < rawOffset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type AnchorResult = { range: Range; state: 'exact' | 'moved' };

/** Find the range a `TextTarget` points at now. */
export function anchorText(doc: Document, target: TextTarget): AnchorResult | null {
  const selectors = [target.container.selector, ...target.container.fallbacks];
  let container: Element | null = null;
  for (const selector of selectors) {
    container = resolveSelector(doc, selector);
    if (container) break;
  }

  const build = (el: Element, start: number, end: number, state: 'exact' | 'moved'): AnchorResult | null => {
    const norm = normalize(el.textContent ?? '');
    const from = positionAt(el, norm.map(start));
    const to = positionAt(el, norm.map(Math.max(start + 1, end)) + 1);
    if (!from || !to) return null;
    const range = doc.createRange();
    try {
      range.setStart(from.node, Math.min(from.offset, from.node.length));
      range.setEnd(to.node, Math.min(to.offset, to.node.length));
    } catch {
      return null;
    }
    return { range, state };
  };

  const search = (el: Element): AnchorResult | null => {
    const text = normalize(el.textContent ?? '').text;
    if (text.slice(target.start, target.end) === target.quote) {
      return build(el, target.start, target.end, 'exact');
    }
    const withContext = text.indexOf(target.prefix + target.quote + target.suffix);
    if (withContext >= 0) {
      const start = withContext + target.prefix.length;
      return build(el, start, start + target.quote.length, 'exact');
    }
    const occurrences: number[] = [];
    let at = text.indexOf(target.quote);
    while (at >= 0) {
      occurrences.push(at);
      at = text.indexOf(target.quote, at + 1);
    }
    if (occurrences.length > 0) {
      const best = occurrences.reduce((a, b) =>
        Math.abs(a - target.start) <= Math.abs(b - target.start) ? a : b,
      );
      return build(el, best, best + target.quote.length, best === target.start ? 'exact' : 'moved');
    }
    const head = target.quote.slice(0, 30);
    if (head.length >= 12) {
      const found = text.indexOf(head);
      if (found >= 0) return build(el, found, found + target.quote.length, 'moved');
    }
    return null;
  };

  if (container) {
    const hit = search(container);
    if (hit) return hit;
  }
  for (const el of doc.querySelectorAll(target.container.tag)) {
    if (el === container || isOverlay(el)) continue;
    const hit = search(el);
    if (hit) return { range: hit.range, state: 'moved' };
  }
  return null;
}

/** Client rects of a range in document coordinates, merged per line. */
export function rangeRects(range: Range): Rect[] {
  const doc = range.startContainer.ownerDocument ?? document;
  const view = doc.defaultView;
  const sx = view?.scrollX ?? 0;
  const sy = view?.scrollY ?? 0;
  const raw = [...range.getClientRects()]
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      x: Math.round(r.left + sx),
      y: Math.round(r.top + sy),
      width: Math.round(r.width),
      height: Math.round(r.height),
    }));
  return mergeRects(raw);
}

/** Union rects that sit on the same line with a gap of 2 px or less. */
export function mergeRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    const sameLine = last && Math.abs(last.y - r.y) <= 2 && Math.abs(last.height - r.height) <= 4;
    if (sameLine && r.x - (last.x + last.width) <= 2) {
      last.width = Math.max(last.x + last.width, r.x + r.width) - last.x;
      last.height = Math.max(last.height, r.height);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Bounding box of every stroke, padded. */
export function strokeBounds(strokes: Stroke[], padding = 24): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const s of strokes) {
    if (s.tool === 'brush') for (const [x, y] of s.points) add(x, y);
    else if (s.tool === 'arrow') {
      add(s.from[0], s.from[1]);
      add(s.to[0], s.to[1]);
    } else if (s.tool === 'label') {
      add(s.at[0], s.at[1] - s.size);
      add(s.at[0] + s.text.length * s.size * 0.6, s.at[1] + s.size * 0.4);
    } else {
      add(s.rect.x, s.rect.y);
      add(s.rect.x + s.rect.width, s.rect.y + s.rect.height);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.round(minX - padding),
    y: Math.round(minY - padding),
    width: Math.round(maxX - minX + padding * 2),
    height: Math.round(maxY - minY + padding * 2),
  };
}

/** Draw strokes onto a 2d context, translated by `origin` and scaled. */
export function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  origin: { x: number; y: number },
  scale = 1,
): void {
  const px = (x: number): number => (x - origin.x) * scale;
  const py = (y: number): number => (y - origin.y) * scale;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.tool === 'label' ? s.color : s.color;
    ctx.fillStyle = s.color;
    if (s.tool !== 'label') ctx.lineWidth = s.width * scale;
    if (s.tool === 'brush') {
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
      ctx.stroke();
    } else if (s.tool === 'arrow') {
      const [x1, y1] = s.from;
      const [x2, y2] = s.to;
      ctx.beginPath();
      ctx.moveTo(px(x1), py(y1));
      ctx.lineTo(px(x2), py(y2));
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = s.width * 3 * scale;
      ctx.beginPath();
      ctx.moveTo(px(x2), py(y2));
      ctx.lineTo(px(x2) - head * Math.cos(angle - 0.4), py(y2) - head * Math.sin(angle - 0.4));
      ctx.lineTo(px(x2) - head * Math.cos(angle + 0.4), py(y2) - head * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    } else if (s.tool === 'rect') {
      ctx.strokeRect(px(s.rect.x), py(s.rect.y), s.rect.width * scale, s.rect.height * scale);
    } else if (s.tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        px(s.rect.x + s.rect.width / 2),
        py(s.rect.y + s.rect.height / 2),
        (Math.abs(s.rect.width) / 2) * scale,
        (Math.abs(s.rect.height) / 2) * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      ctx.font = `${s.size * scale}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text, px(s.at[0]), py(s.at[1]));
    }
  }
  ctx.restore();
}

export interface CaptureOptions {
  domToCanvas?: (node: Element, options: Record<string, unknown>) => Promise<HTMLCanvasElement>;
  maxSide?: number;
  hide?: Element | null;
}

/** PNG of a region with the strokes burned in, or null when capture is not possible. */
export async function captureRegion(
  doc: Document,
  rect: Rect,
  strokes: Stroke[],
  opts: CaptureOptions = {},
): Promise<Blob | null> {
  const hidden = opts.hide as HTMLElement | null | undefined;
  const previous = hidden?.style.visibility ?? '';
  try {
    if (hidden) hidden.style.visibility = 'hidden';
    const view = doc.defaultView;
    if (!view || !opts.domToCanvas) return null;
    const dpr = Math.min(2, view.devicePixelRatio || 1);
    const source = await opts.domToCanvas(doc.body, { scale: dpr, timeout: 5000 });
    const maxSide = opts.maxSide ?? 1600;
    const scale = Math.min(1, maxSide / Math.max(rect.width, rect.height));
    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      source,
      rect.x * dpr,
      rect.y * dpr,
      rect.width * dpr,
      rect.height * dpr,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    renderStrokes(ctx, strokes, rect, scale);
    return await new Promise((done) => canvas.toBlob((blob) => done(blob), 'image/png'));
  } catch {
    return null;
  } finally {
    if (hidden) hidden.style.visibility = previous;
  }
}

/** Pause CSS animations, transitions and videos; the returned function restores them. */
export function freezeAnimations(doc: Document): () => void {
  const style = doc.createElement('style');
  style.dataset.annotFreeze = '';
  style.textContent = `*:not(${OVERLAY_TAG}):not(${OVERLAY_TAG} *) {
    animation-play-state: paused !important;
    transition: none !important;
  }`;
  doc.head.append(style);
  const paused: HTMLVideoElement[] = [];
  for (const video of doc.querySelectorAll('video')) {
    if (!video.paused) {
      video.pause();
      paused.push(video);
    }
  }
  return () => {
    style.remove();
    for (const video of paused) void video.play().catch(() => {});
  };
}
