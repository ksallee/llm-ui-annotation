<script lang="ts">
  import type { AnnotState } from '../annot/annot-annot.svelte.js';
  import Strokes from './Strokes.svelte';

  let {
    annot,
    textPainted = false,
  }: { annot: AnnotState; textPainted?: boolean } = $props();

  const shift = $derived(`translate(${-annot.scroll.x} ${-annot.scroll.y})`);
</script>

<svg class="layer highlights" aria-hidden="true">
  <g transform={shift}>
    {#each annot.visible as a (a.id)}
      {@const anchor = annot.anchors.get(a.id)}
      {#if anchor && anchor.state !== 'lost'}
        {#if a.mode === 'element'}
          {#each anchor.rects as rect, i (i)}
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx="3"
              fill="var(--annot-{a.status}-fill)"
              fill-opacity="0.45"
              stroke="var(--annot-{a.status})"
              stroke-width={a.status === 'review' ? 1 : 2}
              stroke-dasharray={a.status === 'draft' ? '5 4' : undefined}
              style="pointer-events: all"
              role="presentation"
              onmouseenter={() => annot.showCard(a.id)}
            />
          {/each}
        {:else if a.mode === 'text'}
          {#each anchor.rects as rect, i (i)}
            <rect
              x={rect.x}
              y={rect.y - 1}
              width={rect.width}
              height={rect.height + 2}
              rx="2"
              fill={textPainted ? 'transparent' : `var(--annot-${a.status}-fill)`}
              style="pointer-events: all"
              role="presentation"
              onmouseenter={() => annot.showCard(a.id)}
            />
          {/each}
        {:else if a.target.kind === 'page'}
          {@const region = anchor.rects[0] ?? a.target.region}
          <rect
            x={region.x}
            y={region.y}
            width={region.width}
            height={region.height}
            rx="6"
            fill="var(--annot-{a.status}-fill)"
            fill-opacity="0.25"
            stroke="var(--annot-{a.status})"
            stroke-width="1.5"
            stroke-dasharray={a.status === 'draft' ? '5 4' : undefined}
            style="pointer-events: all"
            role="presentation"
            onmouseenter={() => annot.showCard(a.id)}
          />
          <Strokes strokes={a.target.strokes} opacity={a.status === 'draft' ? 0.7 : 0.9} />
        {/if}
      {/if}
    {/each}

    {#each annot.selection as el, i (i)}
      {@const rect = el.getBoundingClientRect()}
      <rect
        x={rect.left + annot.scroll.x}
        y={rect.top + annot.scroll.y}
        width={rect.width}
        height={rect.height}
        rx="3"
        fill="var(--annot-element-fill)"
        fill-opacity="0.4"
        stroke="var(--annot-element)"
        stroke-width="2"
      />
    {/each}

    {#if annot.hover.rect && annot.mode === 'element'}
      <rect
        x={annot.hover.rect.x}
        y={annot.hover.rect.y}
        width={annot.hover.rect.width}
        height={annot.hover.rect.height}
        rx="3"
        fill="var(--annot-element-fill)"
        fill-opacity="0.25"
        stroke="var(--annot-element)"
        stroke-width="2"
      />
    {/if}

    {#if annot.marquee}
      <rect
        x={annot.marquee.x}
        y={annot.marquee.y}
        width={annot.marquee.width}
        height={annot.marquee.height}
        fill="var(--annot-accent-soft)"
        fill-opacity="0.3"
        stroke="var(--annot-accent)"
        stroke-width="1"
        stroke-dasharray="4 3"
      />
    {/if}

    <Strokes strokes={annot.drawing.strokes} />

    {#if annot.drawingRegion && annot.mode === 'page'}
      {@const region = annot.drawingRegion}
      <rect
        x={region.x}
        y={region.y}
        width={region.width}
        height={region.height}
        rx="6"
        fill="none"
        stroke="var(--annot-page)"
        stroke-width="1"
        stroke-dasharray="4 4"
        opacity="0.6"
      />
    {/if}
  </g>
</svg>
