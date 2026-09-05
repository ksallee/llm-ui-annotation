<script lang="ts">
  import type { ElementRef } from '@llm-ui-annotation/core';
  import { place } from '../dom/geometry.js';
  import type { AnnotState } from '../annot/annot-annot.svelte.js';
  import { trapFocus } from './focus.js';

  let {
    annot,
    oncommit,
  }: { annot: AnnotState; oncommit: (comment: string) => void } = $props();

  let card = $state<HTMLElement | null>(null);
  let area = $state<HTMLTextAreaElement | null>(null);
  let height = $state(220);

  const popup = $derived(annot.popup!);
  const primary = $derived(
    popup.editing ? 'Save' : annot.sendMode === 'immediate' ? 'Send' : 'Add',
  );

  const refs = $derived.by((): ElementRef[] => {
    const target = popup.target;
    if (target.kind === 'element') return target.elements;
    if (target.kind === 'text') return [target.container];
    return target.elements;
  });

  const quote = $derived.by(() => {
    const target = popup.target;
    if (target.kind === 'text') return target.quote;
    if (target.kind === 'element') return target.elements[0]?.text ?? '';
    return '';
  });

  const at = $derived.by(() => {
    const view = annot.doc?.defaultView;
    if (!view) return { x: 0, y: 0 };
    const anchor = popup.anchor;
    return place(
      { x: anchor.x - annot.scroll.x, y: anchor.y - annot.scroll.y, width: anchor.width, height: anchor.height },
      { width: 360, height },
      { width: view.innerWidth, height: view.innerHeight },
    );
  });

  $effect(() => {
    area?.focus();
  });

  $effect(() => {
    if (card) height = card.getBoundingClientRect().height;
  });

  function grow(event: Event): void {
    const el = event.currentTarget as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(8 * 20 + 16, Math.max(2 * 20 + 16, el.scrollHeight))}px`;
  }

  function commit(): void {
    if (!popup.comment.trim()) return;
    oncommit(popup.comment.trim());
  }
</script>

<div
  class="card popup"
  bind:this={card}
  use:trapFocus
  role="dialog"
  tabindex="-1"
  aria-label="Annotation"
  style="left: {at.x}px; top: {at.y}px"
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      annot.closePopup();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.stopPropagation();
      commit();
    }
  }}
>
  <div class="breadcrumb"><span>›</span><span>{annot.breadcrumb(popup.target)}</span></div>

  {#if quote}
    <div class="quote">“{quote}”</div>
  {/if}

  <textarea
    class="field"
    bind:this={area}
    bind:value={popup.comment}
    oninput={grow}
    rows="2"
    placeholder="What should change?"
    aria-label="What should change?"
  ></textarea>

  <div class="row">
    <button
      class="btn quiet small"
      aria-expanded={popup.detail}
      onclick={() => (popup.detail = !popup.detail)}>detail {popup.detail ? '▴' : '▾'}</button
    >
    <span class="spacer"></span>
    <button class="btn small" onclick={() => annot.closePopup()}>Cancel</button>
    <button class="btn primary small" disabled={!popup.comment.trim()} onclick={commit}>
      {primary} (⌘↵)
    </button>
  </div>

  {#if popup.detail}
    <div class="detail">
      <dl>
        {#each refs as ref, i (i)}
          <dt>selector</dt>
          <dd>{ref.selector}</dd>
          <dt>rect</dt>
          <dd>{ref.rect.x},{ref.rect.y} {ref.rect.width}×{ref.rect.height}</dd>
          {#if ref.styles}
            {#each Object.entries(ref.styles) as [name, value] (name)}
              <dt>{name}</dt>
              <dd>{value}</dd>
            {/each}
          {/if}
        {/each}
        {#if popup.target.kind === 'text'}
          <dt>offsets</dt>
          <dd>{popup.target.start}–{popup.target.end}</dd>
          <dt>prefix</dt>
          <dd>{popup.target.prefix}</dd>
          <dt>suffix</dt>
          <dd>{popup.target.suffix}</dd>
        {/if}
        {#if popup.target.kind === 'page'}
          <dt>strokes</dt>
          <dd>{popup.target.strokes.length}</dd>
        {/if}
      </dl>
    </div>
  {/if}
</div>
