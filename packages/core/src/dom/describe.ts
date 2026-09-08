import type { ElementContext, ElementRef, Rect } from '../model/types.js';
import { DEFAULT_OVERLAY_TAG, ancestorChain, isOverlay } from './ancestors.js';
import { collapse, stableClasses, truncate } from './css.js';
import { describeName, visibleText } from './name.js';
import { area, intersect, rectOf } from './rect.js';
import { roleOf } from './roles.js';
import { describeSelector } from './selector.js';
import { computedStyles } from './styles.js';
import { matchedDeclarations } from './declared.js';
import { sourceOf } from './source.js';
import { declaredTokens, resolveDeclared } from './tokens.js';

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
  /** Declared tokens to reuse across several elements, instead of one map built per call. */
  declared?: ReadonlyMap<string, string>;
}

function ignorable(el: Element, overlayTag: string): boolean {
  return NEVER_RENDERED.has(el.tagName) || isOverlay(el, overlayTag);
}

const fontSizeOf = (el: Element): string =>
  el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue('font-size') ?? '';

function isFixed(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  return ancestorChain(el).some((a) => {
    const position = view.getComputedStyle(a).getPropertyValue('position');
    return position === 'fixed' || position === 'sticky';
  });
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
    out['class'] = truncate(stableClasses(el).join(' '), ATTR_MAX);
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
  const source = sourceOf(el);
  if (source) ref.source = source;
  if (detailed) {
    const declarations = matchedDeclarations(el);
    if (declarations.length > 0) ref.declared = declarations;
    const styles = computedStyles(el);
    ref.styles = styles;
    const fontPx = Number.parseFloat(fontSizeOf(el)) || 0;
    const tokens = resolveDeclared(styles, opts.declared ?? declaredTokens(el.ownerDocument, el), fontPx);
    if (Object.keys(tokens).length > 0) ref.tokens = tokens;
  }
  if (opts.context !== false) ref.context = contextOf(el, overlayTag);
  return ref;
}

/** Refs without styles or context, for the targets that hold several elements. */
export function compactRefs(elements: readonly Element[], opts: DescribeOptions = {}): ElementRef[] {
  return elements.map((el) => describeElement(el, { ...opts, styles: false, context: false }));
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
  return compactRefs(hits.map((h) => h.el), opts);
}
