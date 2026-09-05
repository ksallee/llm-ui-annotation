import { escapeIdent, isUsableId, quoteValue, stableClasses } from './css.js';

/** Separator between a host selector and a selector inside its open shadow root. */
export const SHADOW_SEP = ' >>> ';

const MAX_WALK_UP = 5;
const MAX_FALLBACKS = 4;
const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-annot-id'];
const ROOT_TAGS = new Set(['html', 'head', 'body']);

type Scope = Document | ShadowRoot;

function scopeOf(el: Element): Scope {
  const root = el.getRootNode();
  return root.nodeType === 9 || root.nodeType === 11 ? (root as Scope) : (el.ownerDocument as Scope);
}

function uniqueIn(scope: Scope, selector: string, el: Element): boolean {
  try {
    const found = scope.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

function attrSelector(tag: string, attr: string, value: string): string {
  return `${tag}[${attr}=${quoteValue(value)}]`;
}

/** Exact for a plain path, `*=` on the path for an absolute or query-bearing href. */
function hrefCandidate(el: Element): string | null {
  const href = el.getAttribute('href');
  if (!href) return null;
  const absolute = href.includes('://');
  if (!absolute && !/[?#]/.test(href)) return attrSelector('a', 'href', href);
  const withoutOrigin = absolute ? href.slice(href.indexOf('://') + 3).replace(/^[^/]*/, '') : href;
  const path = withoutOrigin.split(/[?#]/)[0] ?? '';
  return path === '' || path === '/' ? null : `a[href*=${quoteValue(path)}]`;
}

/** Levels 1-4 of the ladder, most stable first. */
function localCandidates(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const out: string[] = [];

  const id = el.getAttribute('id');
  if (id && isUsableId(id)) out.push(`#${escapeIdent(id)}`);

  for (const attr of TEST_ID_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) out.push(`[${attr}=${quoteValue(value)}]`);
  }

  for (const attr of ['name', 'aria-label']) {
    const value = el.getAttribute(attr)?.trim();
    if (value) out.push(attrSelector(tag, attr, value));
  }
  if (tag === 'a') {
    const href = hrefCandidate(el);
    if (href) out.push(href);
  }
  if (tag === 'img') {
    const alt = el.getAttribute('alt')?.trim();
    if (alt) out.push(attrSelector('img', 'alt', alt));
  }
  if (tag === 'input') {
    const type = el.getAttribute('type');
    const placeholder = el.getAttribute('placeholder')?.trim();
    if (type && placeholder)
      out.push(`input[type=${quoteValue(type)}][placeholder=${quoteValue(placeholder)}]`);
  }

  const classes = stableClasses(el).slice(0, 2).map(escapeIdent);
  if (classes[0]) out.push(`${tag}.${classes[0]}`);
  if (classes[0] && classes[1]) out.push(`${tag}.${classes[0]}.${classes[1]}`);

  return out;
}

function nthOfType(el: Element): number {
  const siblings = el.parentNode?.children;
  if (!siblings) return 1;
  let n = 0;
  for (const sibling of Array.from(siblings)) {
    if (sibling.tagName === el.tagName) n += 1;
    if (sibling === el) break;
  }
  return n;
}

function step(el: Element): string {
  const tag = el.tagName.toLowerCase();
  return ROOT_TAGS.has(tag) ? tag : `${tag}:nth-of-type(${nthOfType(el)})`;
}

/** Full `:nth-of-type` path, from `body` when the element is inside it. */
export function fullPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current) {
    parts.unshift(step(current));
    if (current.tagName.toLowerCase() === 'body') break;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

interface Local {
  selector: string;
  unique: string[];
}

function localSelector(el: Element, depth: number): Local {
  const scope = scopeOf(el);
  const unique = localCandidates(el).filter((c) => uniqueIn(scope, c, el));
  if (unique[0]) return { selector: unique[0], unique };

  const parent = el.parentElement;
  if (parent && depth < MAX_WALK_UP) {
    const combined = `${localSelector(parent, depth + 1).selector} > ${step(el)}`;
    if (uniqueIn(scope, combined, el)) return { selector: combined, unique: [combined] };
  }

  return { selector: fullPath(el), unique };
}

export interface SelectorRef {
  selector: string;
  fallbacks: string[];
}

/** The ladder from spec 2.1, crossing open shadow roots with `>>>`. */
export function describeSelector(el: Element): SelectorRef {
  const local = localSelector(el, 0);
  const path = fullPath(el);
  const fallbacks = local.unique.filter((c) => c !== local.selector).slice(0, MAX_FALLBACKS);
  if (path !== local.selector && !fallbacks.includes(path)) fallbacks.push(path);

  const root = el.getRootNode();
  if (root.nodeType !== 11) return { selector: local.selector, fallbacks };

  const host = (root as ShadowRoot).host;
  const outer = describeSelector(host);
  return {
    selector: `${outer.selector}${SHADOW_SEP}${local.selector}`,
    fallbacks: fallbacks.map((f) => `${outer.selector}${SHADOW_SEP}${f}`),
  };
}

/** Resolve a selector, stepping into open shadow roots at each `>>>`. */
export function resolveSelector(root: Document | ShadowRoot | Element, selector: string): Element | null {
  const parts = selector.split('>>>').map((p) => p.trim());
  let scope: Document | ShadowRoot | Element = root;
  let found: Element | null = null;
  for (const [i, part] of parts.entries()) {
    if (part === '') return null;
    if (i > 0) {
      const shadow: ShadowRoot | null = (found as Element).shadowRoot;
      if (!shadow) return null;
      scope = shadow;
    }
    found = scope.querySelector(part);
    if (!found) return null;
  }
  return found;
}
