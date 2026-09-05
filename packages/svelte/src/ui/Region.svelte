<script lang="ts">
  import type { Rect } from '@llm-ui-annotation/core';
  import { findElementsInRect } from '../dom/core-dom.js';
  import { resizeRect, type Edge } from '../dom/geometry.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';

  let { annot, region }: { annot: AnnotState; region: Rect } = $props();

  const EDGES: Edge[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  let frame = 0;

  const left = $derived(region.x - annot.scroll.x);
  const top = $derived(region.y - annot.scroll.y);

  /** Coalesced to one frame: the element walk is the expensive half of a drag. */
  function count(rect: Rect): void {
    const view = annot.doc.defaultView;
    if (!view) return;
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => {
      annot.regionElements = findElementsInRect(annot.doc, rect, { styles: false }).length;
    });
  }

  $effect(() => {
    count(region);
    return () => annot.doc.defaultView?.cancelAnimationFrame(frame);
  });

  function grab(edge: Edge, event: PointerEvent): void {
    const view = annot.doc.defaultView;
    if (!view || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const from = { ...region };
    const move = (e: PointerEvent): void => {
      const next = resizeRect(from, edge, e.clientX - start.x, e.clientY - start.y);
      annot.setRegion(next);
      count(next);
    };
    const up = (): void => {
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
  }
</script>

<div class="region" style="left: {left}px; top: {top}px; width: {region.width}px; height: {region.height}px">
  {#each EDGES as edge (edge)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="handle {edge}"
      role="separator"
      aria-label="Resize the drawing region, {edge}"
      onpointerdown={(e) => grab(edge, e)}
    ></span>
  {/each}

  <div class="region-bar">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="grip"
      aria-label="Move the drawing region"
      onpointerdown={(e) => grab('move', e)}><Icon name="grip" size={14} /></span
    >
    <span class="muted">{annot.regionElements} elements</span>
    {#if annot.regionOverride}
      <button class="btn quiet small" onclick={() => annot.fitRegionToDrawing()}>
        <Icon name="fit" size={14} /> Fit to drawing
      </button>
    {/if}
  </div>
</div>
