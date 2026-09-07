<script lang="ts">
  // The SVG layer: annotation highlights, the selection, the hover box and every drawing.
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { boxModel } from '../dom/inspect.js';
  import BoxModel from './BoxModel.svelte';
  import Strokes from './Strokes.svelte';

  let {
    annot,
    textPainted = false,
  }: { annot: AnnotState; textPainted?: boolean } = $props();

  const shift = $derived(`translate(${-annot.scroll.x} ${-annot.scroll.y})`);

  // Recomputed whenever the hovered element changes; the bands are read off the live element.
  const box = $derived.by(() => {
    if (annot.mode !== 'element' || !annot.prefs.cssDetails || !annot.hover.el) return null;
    void annot.hover.rect;
    return boxModel(annot.hover.el);
  });
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
        {:else if a.target.kind === 'page' && !annot.hiddenDrawings.has(a.id)}
          <Strokes strokes={a.target.strokes} status={a.status} />
        {/if}
      {/if}
    {/each}

    {#if annot.previewId}
      {#each annot.anchors.get(annot.previewId)?.rects ?? [] as rect, i (i)}
        <rect
          x={rect.x - 2}
          y={rect.y - 2}
          width={rect.width + 4}
          height={rect.height + 4}
          rx="4"
          fill="var(--annot-accent-soft)"
          fill-opacity="0.35"
          stroke="var(--annot-accent)"
          stroke-width="2"
        />
      {/each}
    {/if}

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

    {#if box}
      <BoxModel {box} />
    {:else if annot.hover.rect && annot.mode === 'element'}
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

    {#each annot.drawings as d (d.id)}
      <Strokes strokes={d.strokes} />
    {/each}

    {#if annot.mode === 'page'}
      {#each annot.routeDrawings as d (d.id)}
        {@const picked = annot.selectedDrawings.has(d.id)}
        {@const within = annot.insideDrawing === d.id}
        {#if within}
          <rect
            x={d.region.x - 3}
            y={d.region.y - 3}
            width={d.region.width + 6}
            height={d.region.height + 6}
            rx="8"
            fill="none"
            stroke="var(--annot-accent)"
            stroke-width="5"
            opacity="0.22"
          />
        {/if}
        <rect
          x={d.region.x}
          y={d.region.y}
          width={d.region.width}
          height={d.region.height}
          rx="6"
          fill="none"
          stroke={picked ? 'var(--annot-accent)' : 'var(--annot-page)'}
          stroke-width={picked ? 2 : 1}
          stroke-dasharray={picked ? undefined : '4 4'}
          opacity={picked ? 1 : annot.insideDrawing ? 0.25 : 0.55}
        />
      {/each}

      {#each [...annot.selectedStrokes] as index (index)}
        {@const box = annot.strokeBoxAt(index)}
        {#if box}
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx="3"
            fill="var(--annot-accent-soft)"
            fill-opacity="0.18"
            stroke="var(--annot-accent)"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
        {/if}
      {/each}
    {/if}
  </g>
</svg>
