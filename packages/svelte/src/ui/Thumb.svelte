<script lang="ts">
  // The tile at the head of a panel row: a screenshot, the drawing's own marks, or a mode icon.
  import type { Annotation } from '@llm-ui-annotation/core';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { strokeBounds } from '../dom/core-dom.js';
  import Icon from './Icon.svelte';
  import { MODE_ICON } from './mode-icon.js';
  import Strokes from './Strokes.svelte';

  let { annot, annotation }: { annot: AnnotState; annotation: Annotation } = $props();

  const a = $derived(annotation);
  const drawing = $derived(a.target.kind === 'page' ? a.target : null);
  const shot = $derived(annot.thumbnails.get(a.id) ?? null);
  // The marks fill the tile; the region is mostly the padding around them.
  const box = $derived(
    drawing && drawing.strokes.length > 0 ? strokeBounds(drawing.strokes) : (drawing?.region ?? null),
  );

  $effect(() => {
    if (drawing?.screenshot) void annot.loadThumbnail(a.id);
  });
</script>

<span class="thumb">
  {#if shot}
    <img src={shot} alt="" />
  {:else if drawing && box}
    <svg
      class="marks"
      viewBox="{box.x} {box.y} {box.width} {box.height}"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <Strokes strokes={drawing.strokes} />
    </svg>
  {:else}
    <Icon name={MODE_ICON[a.mode]} size={20} />
  {/if}
</span>
