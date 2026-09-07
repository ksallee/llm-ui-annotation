<script lang="ts">
  // The devtools box-model bands painted over the hovered element.
  import type { Rect } from '@llm-ui-annotation/core';
  import { hasSide, type BoxModel } from '../dom/inspect.js';

  let { box }: { box: BoxModel } = $props();

  const frame = (r: Rect): string =>
    `M${r.x} ${r.y}H${r.x + r.width}V${r.y + r.height}H${r.x}Z`;

  const ring = (outer: Rect, inner: Rect): string => `${frame(outer)} ${frame(inner)}`;
</script>

<g class="box-model" aria-hidden="true">
  {#if hasSide(box.margin)}
    <path d={ring(box.marginBox, box.borderBox)} fill-rule="evenodd" fill="var(--annot-box-margin)" />
  {/if}
  {#if hasSide(box.border)}
    <path d={ring(box.borderBox, box.paddingBox)} fill-rule="evenodd" fill="var(--annot-box-border)" />
  {/if}
  {#if hasSide(box.padding)}
    <path d={ring(box.paddingBox, box.contentBox)} fill-rule="evenodd" fill="var(--annot-box-padding)" />
  {/if}

  <rect
    x={box.contentBox.x}
    y={box.contentBox.y}
    width={box.contentBox.width}
    height={box.contentBox.height}
    fill="var(--annot-box-content)"
  />
</g>
