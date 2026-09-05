<script lang="ts">
  import type { Stroke } from '@llm-ui-annotation/core';
  import { smoothPath } from '../dom/geometry.js';

  let { strokes, opacity = 1 }: { strokes: Stroke[]; opacity?: number } = $props();
</script>

<g {opacity}>
  {#each strokes as stroke, i (i)}
    {#if stroke.tool === 'brush'}
      <path
        d={smoothPath(stroke.points)}
        stroke={stroke.color}
        stroke-width={stroke.width}
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {:else if stroke.tool === 'arrow'}
      {@const angle = Math.atan2(stroke.to[1] - stroke.from[1], stroke.to[0] - stroke.from[0])}
      {@const head = stroke.width * 3}
      <line
        x1={stroke.from[0]}
        y1={stroke.from[1]}
        x2={stroke.to[0]}
        y2={stroke.to[1]}
        stroke={stroke.color}
        stroke-width={stroke.width}
        stroke-linecap="round"
      />
      <polygon
        fill={stroke.color}
        points={`${stroke.to[0]},${stroke.to[1]} ${stroke.to[0] - head * Math.cos(angle - 0.4)},${stroke.to[1] - head * Math.sin(angle - 0.4)} ${stroke.to[0] - head * Math.cos(angle + 0.4)},${stroke.to[1] - head * Math.sin(angle + 0.4)}`}
      />
    {:else if stroke.tool === 'rect'}
      <rect
        x={stroke.rect.x}
        y={stroke.rect.y}
        width={stroke.rect.width}
        height={stroke.rect.height}
        stroke={stroke.color}
        stroke-width={stroke.width}
        fill="none"
        rx="2"
      />
    {:else if stroke.tool === 'ellipse'}
      <ellipse
        cx={stroke.rect.x + stroke.rect.width / 2}
        cy={stroke.rect.y + stroke.rect.height / 2}
        rx={Math.max(1, stroke.rect.width / 2)}
        ry={Math.max(1, stroke.rect.height / 2)}
        stroke={stroke.color}
        stroke-width={stroke.width}
        fill="none"
      />
    {:else}
      <text
        x={stroke.at[0]}
        y={stroke.at[1]}
        fill={stroke.color}
        font-size={stroke.size}
        font-family="system-ui, sans-serif"
        dominant-baseline="hanging">{stroke.text}</text
      >
    {/if}
  {/each}
</g>
