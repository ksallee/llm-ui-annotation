import type { ElementRef, Target } from './types.js';

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** `button "Save"`, or the selector when the element has no name. */
export function elementLabel(el: ElementRef): string {
  if (!el.name) return el.selector;
  // `describeElement` already returns `tag "label"`; a bare label still needs composing.
  const composed = el.name === el.tag || (el.name.startsWith(el.tag) && /^[\s["(]/.test(el.name.slice(el.tag.length)));
  return composed ? truncate(el.name, 48) : `${el.tag} "${truncate(el.name, 40)}"`;
}

/** One line naming what an annotation points at. */
export function summarizeTarget(target: Target): string {
  switch (target.kind) {
    case 'element': {
      const [first, ...rest] = target.elements;
      if (!first) return 'no element';
      if (rest.length === 0) return `${elementLabel(first)} (${first.selector})`;
      const named = target.elements.slice(0, 3).map(elementLabel).join(', ');
      return `${target.elements.length} elements: ${named}${rest.length > 2 ? ', …' : ''}`;
    }
    case 'text':
      return `text "${truncate(target.quote, 48)}" in ${target.container.selector}`;
    case 'page': {
      if (target.elements.length === 0) {
        return `drawing over ${target.strokes.length} stroke${target.strokes.length === 1 ? '' : 's'}`;
      }
      const named = target.elements.slice(0, 3).map(elementLabel).join(', ');
      return `drawing over ${target.elements.length} element${target.elements.length === 1 ? '' : 's'}: ${named}${target.elements.length > 3 ? ', …' : ''}`;
    }
  }
}
