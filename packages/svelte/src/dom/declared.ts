// What the page's own stylesheets say about an element, as written rather than as computed.

import { PREVIEW_ATTR } from './preview.js';

/** One declaration the source makes for an element. */
export interface Declaration {
  property: string;
  /** As authored, so a token reads as `var(--space-5)` and a shorthand stays one. */
  value: string;
  /** The selector that set it, or `style` for an inline declaration. */
  from: string;
  /** Set on an ancestor and inherited by this element. */
  inherited: boolean;
}

/** Properties that reach an element from its ancestors when it declares none of its own. */
const INHERITS = new Set([
  'color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'list-style',
  'text-align',
  'text-indent',
  'text-transform',
  'visibility',
  'white-space',
  'word-spacing',
]);

const isStyleRule = (rule: CSSRule): rule is CSSStyleRule =>
  typeof (rule as CSSStyleRule).selectorText === 'string';

/** Style rules in cascade order, entering the grouping rules that currently apply. */
function* styleRules(doc: Document): Generator<CSSStyleRule> {
  const view = doc.defaultView;
  const walk = function* (rules: CSSRuleList): Generator<CSSStyleRule> {
    for (const rule of Array.from(rules)) {
      const media = (rule as CSSMediaRule).conditionText;
      const inner = (rule as CSSGroupingRule).cssRules;
      if (isStyleRule(rule)) yield rule;
      else if (inner && (media === undefined || (view?.matchMedia(media).matches ?? true))) {
        yield* walk(inner);
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    // Our own preview is not something the page declares.
    if ((sheet.ownerNode as Element | null)?.hasAttribute?.(PREVIEW_ATTR)) continue;
    try {
      yield* walk(sheet.cssRules);
    } catch {
      /* cross-origin, unreadable */
    }
  }
}

const matches = (el: Element, selector: string): boolean => {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
};

/** `padding: var(--a) var(--b); color: red` as pairs, parentheses respected. */
export function parseDeclarations(cssText: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let current = '';
  for (const ch of `${cssText};`) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) {
      const at = current.indexOf(':');
      const property = current.slice(0, at).trim();
      const value = current.slice(at + 1).trim();
      if (at > 0 && value !== '') out.push([property, value]);
      current = '';
    } else current += ch;
  }
  return out;
}

/** Own declarations in cascade order, one entry per property, the last to win kept. */
function ownDeclarations(el: Element): Map<string, Declaration> {
  const out = new Map<string, Declaration>();
  const take = (from: string, cssText: string, inherited: boolean): void => {
    for (const [property, value] of parseDeclarations(cssText)) {
      out.delete(property);
      out.set(property, { property, value, from, inherited });
    }
  };
  for (const rule of styleRules(el.ownerDocument)) {
    if (matches(el, rule.selectorText)) take(rule.selectorText, rule.style.cssText, false);
  }
  take('style', (el as HTMLElement).style?.cssText ?? '', false);
  return out;
}

/**
 * Every declaration that reaches the element: its own, then the inheritable ones from the nearest
 * ancestor that sets them. Cascade order without specificity — the last matching rule wins, which is
 * right for the flat stylesheets a page ships and can differ from the browser on a contrived one.
 */
export function matchedDeclarations(el: Element): Declaration[] {
  const own = ownDeclarations(el);
  const out = [...own.values()];

  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    for (const declaration of ownDeclarations(parent).values()) {
      if (!INHERITS.has(declaration.property) || own.has(declaration.property)) continue;
      own.set(declaration.property, declaration);
      out.push({ ...declaration, inherited: true });
    }
  }
  return out;
}
