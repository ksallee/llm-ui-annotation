import { elementLabel, type Target } from '@llm-ui-annotation/core';

/** The two halves of a row's target line: `name` is never truncated, `where` may be. */
export interface TargetLine {
  name: string;
  where: string;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Selectors identify themselves by their tail, so drop the head when one is too long. */
function tail(text: string, max = 44): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `…${t.slice(t.length - (max - 1))}`;
}

/** Splits what an annotation points at into the identifying half and the droppable half. */
export function targetLine(target: Target): TargetLine {
  switch (target.kind) {
    case 'element': {
      const [first, ...rest] = target.elements;
      if (!first) return { name: 'no element', where: '' };
      const name = rest.length === 0 ? elementLabel(first) : `${elementLabel(first)} +${rest.length}`;
      return { name, where: tail(first.selector) };
    }
    case 'text': {
      const where = target.blocks?.length
        ? `across ${target.blocks.map((b) => b.selector).join(', ')}`
        : `in ${target.container.selector}`;
      return { name: `"${clip(target.quote, 56)}"`, where: tail(where) };
    }
  }
}
