<script lang="ts">
  import type { Annotation } from '@llm-ui-annotation/core';
  import { place } from '../dom/geometry.js';
  import type { AnnotState } from '../annot/annot-annot.svelte.js';

  let { annot, annotation }: { annot: AnnotState; annotation: Annotation } = $props();

  let answer = $state('');

  const anchor = $derived(annot.anchors.get(annotation.id));
  const agent = $derived(annot.lastAgentMessage(annotation));
  const at = $derived.by(() => {
    const rect = anchor?.rects[0];
    const view = annot.doc?.defaultView;
    if (!rect || !view) return { x: 0, y: 0 };
    return place(
      { x: rect.x - annot.scroll.x, y: rect.y - annot.scroll.y, width: rect.width, height: rect.height },
      { width: 280, height: 140 },
      { width: view.innerWidth, height: view.innerHeight },
    );
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="card hover-card"
  style="left: {at.x}px; top: {at.y}px; position: fixed"
  onmouseleave={() => (annot.hoverCard = null)}
>
  <div class="row">
    <span class="status-pill" style="background: var(--annot-{annotation.status}-fill)">
      #{annotation.number} · {annotation.status}
    </span>
    <span class="spacer"></span>
  </div>
  <div>{annotation.comment}</div>

  {#if annotation.status === 'review' && agent}
    <div class="muted">{agent.text}</div>
    <div class="row end">
      <button class="btn primary small" onclick={() => annot.approve(annotation.id)}>Approve</button>
    </div>
  {:else if annotation.status === 'question' && agent}
    <div class="muted">{agent.text}</div>
    <input
      class="field"
      placeholder="Answer…"
      bind:value={answer}
      onkeydown={(e) => {
        if (e.key === 'Enter' && answer.trim()) {
          void annot.answer(annotation.id, answer.trim());
          answer = '';
        }
      }}
    />
  {/if}
</div>
