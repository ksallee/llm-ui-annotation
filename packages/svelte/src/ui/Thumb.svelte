<script lang="ts">
  import type { Annotation } from '@llm-ui-annotation/core';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { strokeBounds } from '../dom/core-dom.js';
  import type { IconName } from '../icons.js';
  import Icon from './Icon.svelte';
  import Strokes from './Strokes.svelte';

  let { annot, annotation }: { annot: AnnotState; annotation: Annotation } = $props();

  const MODE_ICON: Record<string, IconName> = { element: 'element', text: 'text', page: 'page' };

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
    <Icon name={MODE_ICON[a.mode] ?? 'element'} size={20} />
  {/if}
</span>
