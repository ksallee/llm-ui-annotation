<script lang="ts">
  import type { Status, Stroke } from '@llm-ui-annotation/core';
  import { smoothPath } from '../dom/geometry.js';
  import { labelBox } from '../dom/core-dom.js';

  let {
    strokes,
    opacity,
    status = null,
  }: { strokes: Stroke[]; opacity?: number; status?: Status | null } = $props();

  // The five colours are the drawer's own meaning — red for wrong, green for good — so status
  // rides behind the marks as a halo instead of repainting them, and approved settles back.
  const settled = $derived(status === 'approved');
  const ink = $derived(opacity ?? (settled ? 0.45 : status === 'draft' ? 0.75 : 0.95));
  const halo = $derived(status ? (settled ? 0.14 : 0.3) : 0);
</script>

{#snippet marks(tint: string | null, grow: number)}
  {#each strokes as stroke, i (i)}
    {#if stroke.tool === 'brush'}
      <path
        d={smoothPath(stroke.points)}
        stroke={tint ?? stroke.color}
        stroke-width={stroke.width + grow}
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {:else if stroke.tool === 'arrow'}
      {@const angle = Math.atan2(stroke.to[1] - stroke.from[1], stroke.to[0] - stroke.from[0])}
      {@const head = stroke.width * 3 + grow}
      <line
        x1={stroke.from[0]}
        y1={stroke.from[1]}
        x2={stroke.to[0]}
        y2={stroke.to[1]}
        stroke={tint ?? stroke.color}
        stroke-width={stroke.width + grow}
        stroke-linecap="round"
      />
      <polygon
        fill={tint ?? stroke.color}
        points={`${stroke.to[0]},${stroke.to[1]} ${stroke.to[0] - head * Math.cos(angle - 0.4)},${stroke.to[1] - head * Math.sin(angle - 0.4)} ${stroke.to[0] - head * Math.cos(angle + 0.4)},${stroke.to[1] - head * Math.sin(angle + 0.4)}`}
      />
    {:else if stroke.tool === 'rect'}
      <rect
        x={stroke.rect.x}
        y={stroke.rect.y}
        width={stroke.rect.width}
        height={stroke.rect.height}
        stroke={tint ?? stroke.color}
        stroke-width={stroke.width + grow}
        fill="none"
        rx="2"
      />
    {:else if stroke.tool === 'ellipse'}
      <ellipse
        cx={stroke.rect.x + stroke.rect.width / 2}
        cy={stroke.rect.y + stroke.rect.height / 2}
        rx={Math.max(1, stroke.rect.width / 2)}
        ry={Math.max(1, stroke.rect.height / 2)}
        stroke={tint ?? stroke.color}
        stroke-width={stroke.width + grow}
        fill="none"
      />
    {:else}
      {@const box = labelBox(stroke.text, stroke.size)}
      <rect
        x={stroke.at[0] - grow / 2}
        y={stroke.at[1] - grow / 2}
        width={box.width + grow}
        height={box.height + grow}
        rx="4"
        fill={tint ?? stroke.color}
      />
      {#if !tint}
        <text
          x={stroke.at[0] + 4}
          y={stroke.at[1] + 4}
          fill="var(--annot-accent-ink)"
          font-size={stroke.size}
          font-family="system-ui, sans-serif"
          dominant-baseline="hanging">{stroke.text}</text
        >
      {/if}
    {/if}
  {/each}
{/snippet}

{#if status && halo > 0}
  <g opacity={halo}>{@render marks(`var(--annot-${status})`, 7)}</g>
{/if}

<g opacity={ink}>{@render marks(null, 0)}</g>
