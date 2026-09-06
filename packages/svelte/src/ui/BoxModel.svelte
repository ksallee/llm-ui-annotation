<script lang="ts">
  import type { Rect } from '@llm-ui-annotation/core';
  import { hasSide, type BoxModel, type Sides } from '../dom/inspect.js';

  let { box }: { box: BoxModel } = $props();

  interface Num {
    x: number;
    y: number;
    text: string;
  }

  const frame = (r: Rect): string =>
    `M${r.x} ${r.y}H${r.x + r.width}V${r.y + r.height}H${r.x}Z`;

  const ring = (outer: Rect, inner: Rect): string => `${frame(outer)} ${frame(inner)}`;

  const num = (v: number): string => String(Math.round(v * 10) / 10);

  /**
   * One number per non-zero side, in the strip that side occupies. `along` staggers the three bands
   * across the edge so a 1 px border does not print into the padding beside it.
   */
  function band(outer: Rect, inner: Rect, sides: Sides, along: number): Num[] {
    const cx = inner.x + inner.width * along;
    const cy = inner.y + inner.height * along;
    const out: Num[] = [];
    if (sides.top) out.push({ x: cx, y: (outer.y + inner.y) / 2, text: num(sides.top) });
    if (sides.bottom) {
      out.push({
        x: cx,
        y: (outer.y + outer.height + inner.y + inner.height) / 2,
        text: num(sides.bottom),
      });
    }
    if (sides.left) out.push({ x: (outer.x + inner.x) / 2, y: cy, text: num(sides.left) });
    if (sides.right) {
      out.push({
        x: (outer.x + outer.width + inner.x + inner.width) / 2,
        y: cy,
        text: num(sides.right),
      });
    }
    return out;
  }

  // On a small element the size label would sit on top of the side numbers; the drawer has it.
  const showSize = $derived(box.contentBox.width >= 56 && box.contentBox.height >= 14);

  const numbers = $derived([
    ...band(box.marginBox, box.borderBox, box.margin, 0.5),
    ...band(box.borderBox, box.paddingBox, box.border, 0.25),
    ...band(box.paddingBox, box.contentBox, box.padding, 0.75),
  ]);
</script>

<g class="box-model" aria-hidden="true">
  {#if hasSide(box.margin)}
    <path
      d={ring(box.marginBox, box.borderBox)}
      fill-rule="evenodd"
      fill="var(--annot-element-fill)"
      fill-opacity="0.16"
    />
  {/if}
  {#if hasSide(box.border)}
    <path
      d={ring(box.borderBox, box.paddingBox)}
      fill-rule="evenodd"
      fill="var(--annot-element-fill)"
      fill-opacity="0.3"
    />
  {/if}
  {#if hasSide(box.padding)}
    <path
      d={ring(box.paddingBox, box.contentBox)}
      fill-rule="evenodd"
      fill="var(--annot-element-fill)"
      fill-opacity="0.45"
    />
  {/if}

  <rect
    x={box.contentBox.x}
    y={box.contentBox.y}
    width={box.contentBox.width}
    height={box.contentBox.height}
    fill="var(--annot-element)"
    fill-opacity="0.22"
  />

  <rect
    x={box.borderBox.x}
    y={box.borderBox.y}
    width={box.borderBox.width}
    height={box.borderBox.height}
    rx="3"
    fill="none"
    stroke="var(--annot-element)"
    stroke-width="2"
  />

  {#each numbers as n, i (i)}
    <text class="box-num" x={n.x} y={n.y}>{n.text}</text>
  {/each}

  {#if showSize}
    <text
      class="box-num size"
      x={box.contentBox.x + box.contentBox.width / 2}
      y={box.contentBox.y + box.contentBox.height / 2}
    >
      {num(box.contentBox.width)} × {num(box.contentBox.height)}
    </text>
  {/if}
</g>
