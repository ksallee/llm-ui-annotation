<script lang="ts">
  import type { AnnotState } from '../state/annot-state.svelte.js';

  let { annot, onopen }: { annot: AnnotState; onopen: (id: string) => void } = $props();

  const dots = $derived(annot.prefs.markers === 'dots');
</script>

{#if annot.prefs.markers !== 'none'}
  {#each annot.visible as a (a.id)}
    {@const point = annot.markerPoint(a.id)}
    {@const anchor = annot.anchors.get(a.id)}
    {#if point && anchor && anchor.state !== 'lost'}
      <button
        class="marker {a.status}"
        class:dot={dots}
        class:moved={anchor.state === 'moved'}
        style="left: {point.x - annot.scroll.x}px; top: {point.y - annot.scroll.y}px;
               background: var(--annot-{a.status}); color: var(--annot-{a.status}-ink)"
        title={anchor.state === 'moved' ? 'text moved, check the highlight' : a.comment}
        aria-label="Annotation {a.number}, {a.status}"
        onclick={() => onopen(a.id)}
        onmouseenter={() => annot.showCard(a.id)}
        onmouseleave={() => annot.hideCardSoon()}
        onfocus={() => (annot.focusedId = a.id)}
        oncontextmenu={(e) => {
          if (a.status !== 'draft') return;
          e.preventDefault();
          void annot.deleteDraft(a.id);
        }}
      >
        {dots ? '' : a.number}
      </button>
    {/if}
  {/each}
{/if}
