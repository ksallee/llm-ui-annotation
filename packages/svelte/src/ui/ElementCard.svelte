<script lang="ts">
  import type { Rect } from '@llm-ui-annotation/core';
  import { tokenMap } from '../dom/core-dom.js';
  import { elementCard } from '../dom/inspect.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import NodeTitle from './NodeTitle.svelte';

  let { annot, el, rect }: { annot: AnnotState; el: Element; rect: Rect } = $props();

  const GAP = 6;
  const MARGIN = 4;

  let height = $state(0);
  let width = $state(0);

  // Keyed on the element alone: the map walks every stylesheet, and scrolling must not redo it.
  const tokens = $derived(tokenMap(annot.doc, el));

  const card = $derived.by(() => {
    void rect;
    return elementCard(el, tokens);
  });

  // Above the element, as devtools does; below when the top of the window is in the way.
  const at = $derived.by(() => {
    const view = annot.doc.defaultView;
    const top = rect.y - annot.scroll.y;
    const left = rect.x - annot.scroll.x;
    if (!view) return { x: left, y: top };
    const above = top - height - GAP;
    const limit = Math.max(MARGIN, view.innerWidth - width - MARGIN);
    return {
      x: Math.min(Math.max(MARGIN, left), limit),
      y: above >= MARGIN ? above : top + rect.height + GAP,
    };
  });
</script>

{#if card}
  <div
    class="element-card"
    bind:clientHeight={height}
    bind:clientWidth={width}
    style="left: {at.x}px; top: {at.y}px"
    aria-hidden="true"
  >
    <NodeTitle label={card.label} size={card.size} />

    <dl>
      {#each card.rows as row (row.name)}
        <dt>{row.name}</dt>
        <dd>
          {#if row.swatch}<span class="swatch inline" style="background: {row.swatch}"></span>{/if}{row.value}
          {#if row.token}<span class="token">{row.token}</span>{/if}
        </dd>
      {/each}
    </dl>

    <div class="section">Accessibility</div>
    <dl>
      {#each card.a11y as row (row.name)}
        <dt>{row.name}</dt>
        <dd>{row.value}</dd>
      {/each}
    </dl>
  </div>
{/if}
