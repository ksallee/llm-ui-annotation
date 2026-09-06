import type { ElementContext, ElementRef, Rect } from '../model/types.js';
import { classList, collapse, isStableClass, truncate } from './css.js';
import { describeName, visibleText } from './name.js';
import { area, intersect, rectOf } from './rect.js';
import { roleOf } from './roles.js';
import { describeSelector } from './selector.js';
import { computedStyles } from './styles.js';
import { resolveTokens, tokenMap, type TokenMap } from './tokens.js';

const DEFAULT_OVERLAY_TAG = 'annot-overlay';
const DEFAULT_MAX_TEXT = 200;
const ATTR_MAX = 100;
const ATTR_NAMES = ['id', 'class', 'name', 'type', 'href', 'src', 'alt', 'title', 'placeholder', 'role'];
const NEVER_RENDERED = new Set([
  'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'TEMPLATE', 'NOSCRIPT', 'BR', 'BASE',
]);

const MIN_SIZE = 8;
const MIN_COVERAGE = 0.3;
const MAX_REGION_SHARE = 0.9;
const PARENT_DROP = 0.8;
const MAX_RESULTS = 12;

export interface DescribeOptions {
  /** Include the computed style subset. Default true. */
  styles?: boolean;
  /** Include parent and sibling names. Default true. */
  context?: boolean;
  /** Tag of the overlay host, skipped everywhere. Default `annot-overlay`. */
  overlayTag?: string;
  /** Cap on `text`. Default 200. */
  maxText?: number;
  /** A map to reuse across several elements, instead of one built per call. */
  tokens?: TokenMap;
}

export function isOverlay(el: Element, overlayTag = DEFAULT_OVERLAY_TAG): boolean {
  const tag = overlayTag.toUpperCase();
  for (let current: Element | null = el; current; current = current.parentElement) {
    if (current.tagName === tag) return true;
  }
  return false;
}

function ignorable(el: Element, overlayTag: string): boolean {
  return NEVER_RENDERED.has(el.tagName) || isOverlay(el, overlayTag);
}

function isFixed(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  let current: Element | null = el;
  while (current) {
    const position = view.getComputedStyle(current).getPropertyValue('position');
    if (position === 'fixed' || position === 'sticky') return true;
    const root = current.getRootNode();
    current = current.parentElement ?? (root.nodeType === 11 ? (root as ShadowRoot).host : null);
  }
  return false;
}

function attrsOf(el: Element, detailed: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const keep = ATTR_NAMES.includes(name) || name.startsWith('aria-') || name.startsWith('data-');
    if (!keep) continue;
    out[name] = truncate(attr.value.trim(), ATTR_MAX);
  }
  const raw = out['class'];
  if (raw !== undefined) {
    const stable = classList(el).filter(isStableClass);
    out['class'] = truncate(stable.join(' '), ATTR_MAX);
    if (detailed && out['class'] !== raw) out['class:raw'] = raw;
    if (out['class'] === '') delete out['class'];
  }
  return out;
}

function siblingName(el: Element | null, overlayTag: string, next: boolean): string | null {
  let current = el;
  while (current) {
    if (!ignorable(current, overlayTag)) return describeName(current);
    current = next ? current.nextElementSibling : current.previousElementSibling;
  }
  return null;
}

function contextOf(el: Element, overlayTag: string): ElementContext {
  const parent = el.parentElement;
  return {
    parent: parent && !ignorable(parent, overlayTag) ? describeName(parent) : null,
    prev: siblingName(el.previousElementSibling, overlayTag, false),
    next: siblingName(el.nextElementSibling, overlayTag, true),
  };
}

/** Everything the agent gets about one element. */
export function describeElement(el: Element, opts: DescribeOptions = {}): ElementRef {
  const overlayTag = opts.overlayTag ?? DEFAULT_OVERLAY_TAG;
  const detailed = opts.styles !== false;
  const { selector, fallbacks } = describeSelector(el);

  const ref: ElementRef = {
    selector,
    fallbacks,
    tag: el.tagName.toLowerCase(),
    role: roleOf(el),
    name: describeName(el),
    text: truncate(collapse(visibleText(el)), opts.maxText ?? DEFAULT_MAX_TEXT),
    rect: rectOf(el),
    fixed: isFixed(el),
    attrs: attrsOf(el, detailed),
  };
  if (detailed) {
    const styles = computedStyles(el);
    ref.styles = styles;
    const tokens = resolveTokens(styles, opts.tokens ?? tokenMap(el.ownerDocument, el));
    if (Object.keys(tokens).length > 0) ref.tokens = tokens;
  }
  if (opts.context !== false) ref.context = contextOf(el, overlayTag);
  return ref;
}

interface Hit {
  el: Element;
  overlap: number;
  oversized: boolean;
}

function hitsIn(doc: Document, region: Rect, overlayTag: string): Hit[] {
  const regionArea = area(region);
  const out: Hit[] = [];
  for (const el of Array.from(doc.body?.querySelectorAll('*') ?? [])) {
    if (ignorable(el, overlayTag)) continue;
    const rect = rectOf(el);
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;
    const overlap = area(intersect(rect, region));
    if (overlap < MIN_COVERAGE * area(rect)) continue;
    out.push({ el, overlap, oversized: regionArea > 0 && area(rect) > MAX_REGION_SHARE * regionArea });
  }
  return out;
}

function dropCoveredParents(hits: Hit[]): Hit[] {
  return hits.filter(
    (hit) =>
      !hits.some(
        (other) => other !== hit && hit.el.contains(other.el) && other.overlap >= PARENT_DROP * hit.overlap,
      ),
  );
}

/** Elements the user drew around, largest overlap first, compact. */
export function findElementsInRect(doc: Document, region: Rect, opts: DescribeOptions = {}): ElementRef[] {
  const overlayTag = opts.overlayTag ?? DEFAULT_OVERLAY_TAG;
  const all = hitsIn(doc, region, overlayTag);
  const sized = all.filter((h) => !h.oversized);
  const hits = dropCoveredParents(sized.length > 0 ? sized : all)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, MAX_RESULTS);
  return hits.map((h) => describeElement(h.el, { ...opts, styles: false, context: false }));
}
