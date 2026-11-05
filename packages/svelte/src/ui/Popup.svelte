<script lang="ts">
  // The note composer, anchored to whatever was just selected.
  import type { ElementRef } from '@llm-ui-annotation/core';
  import { place } from '../dom/geometry.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Attachments from './Attachments.svelte';
  import { fileDrop, filesOf } from './drop.js';
  import { trapFocus } from './focus.js';
  import Icon from './Icon.svelte';

  let {
    annot,
    oncommit,
  }: { annot: AnnotState; oncommit: (send: boolean) => void } = $props();

  let card = $state<HTMLElement | null>(null);
  let area = $state<HTMLTextAreaElement | null>(null);
  let replaceArea = $state<HTMLTextAreaElement | null>(null);
  let height = $state(220);

  const popup = $derived(annot.popup!);
  const attachedTo = $derived(popup.editing ?? popup.draftId);
  const attachments = $derived(
    attachedTo ? (annot.annotations.get(attachedTo)?.attachments ?? []) : [],
  );

  /** Attach to the note being written, creating the draft behind it on the first file. */
  async function take(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const id = await annot.popupAnnotation();
    if (id) await annot.attach(id, files);
  }

  const refs = $derived.by((): ElementRef[] => {
    const target = popup.target;
    return target.kind === 'element' ? target.elements : [target.container];
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

  const replacing = $derived(popup.replacing !== null);
  const offersReplace = $derived(popup.mode === 'text' && !popup.editing && annot.canReplace);
  const unchanged = $derived(
    popup.target.kind === 'text' && (popup.replacing ?? '') === popup.target.quote,
  );

  $effect(() => {
    if (replacing) {
      replaceArea?.focus();
      replaceArea?.select();
    } else {
      area?.focus();
    }
  });

  $effect(() => {
    if (card) height = card.getBoundingClientRect().height;
  });

  function grow(event: Event): void {
    const el = event.currentTarget as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(8 * 20 + 16, Math.max(2 * 20 + 16, el.scrollHeight))}px`;
  }

  function commit(send: boolean): void {
    if (!popup.comment.trim()) return;
    oncommit(send);
  }
</script>

<div
  class="card popup"
  bind:this={card}
  use:trapFocus
  use:fileDrop={(files) => void take(files)}
  role="dialog"
  tabindex="-1"
  aria-label="Annotation"
  style="left: {at.x}px; top: {at.y}px"
  onpaste={(e) => {
    const files = filesOf(e);
    if (files.length === 0) return;
    e.preventDefault();
    void take(files);
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      annot.closePopup();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.stopPropagation();
      if (replacing) void annot.confirmReplace();
      else commit(e.shiftKey);
    }
  }}
>
  {#if popup.replacing !== null}
    <textarea
      class="field"
      bind:this={replaceArea}
      bind:value={popup.replacing}
      oninput={grow}
      rows="2"
      aria-label="Replace the selected text with"
    ></textarea>
    {#if popup.error}
      <p class="error" role="alert">{popup.error}</p>
    {/if}
    <div class="row">
      <button class="btn quiet small" onclick={() => annot.cancelReplace()}>Back to note</button>
      <span class="spacer"></span>
      <button
        class="btn primary small"
        disabled={unchanged || popup.busy}
        onclick={() => void annot.confirmReplace()}
      >
        Replace<kbd>⌘↵</kbd>
      </button>
    </div>
  {:else}
    <textarea
      class="field"
      bind:this={area}
      bind:value={popup.comment}
      oninput={grow}
      rows="2"
      placeholder="What should change?"
      aria-label="What should change?"
    ></textarea>

    {#if annot.styleEdits.length > 0}
      <span class="muted"
        >{annot.styleEdits.length} CSS change{annot.styleEdits.length === 1 ? '' : 's'}</span
      >
    {/if}

    {#if attachedTo}
      <Attachments {annot} id={attachedTo} items={attachments} />
    {/if}

    <span class="drop-hint"><Icon name="clip" size={14} /> Drop to attach</span>

    <div class="row">
      <button
        class="btn quiet small"
        aria-expanded={popup.detail}
        onclick={() => (popup.detail = !popup.detail)}>details {popup.detail ? '▴' : '▾'}</button
      >
      <span class="spacer"></span>
      {#if popup.editing}
        <button class="btn primary small" disabled={!popup.comment.trim()} onclick={() => commit(false)}>
          Save<kbd>⌘↵</kbd>
        </button>
      {:else}
        {#if offersReplace}
          <button class="btn quiet small" onclick={() => annot.startReplace()}>Replace</button>
        {/if}
        {#if annot.sendMode === 'manual'}
          <button class="btn primary small" disabled={!popup.comment.trim()} onclick={() => commit(false)}>
            Add<kbd>⌘↵</kbd>
          </button>
        {/if}
        <button
          class="btn small"
          class:primary={annot.autoSends}
          disabled={!popup.comment.trim()}
          onclick={() => commit(true)}
        >
          Send<kbd>{annot.sendMode === 'manual' ? '⇧⌘↵' : '⌘↵'}</kbd>
        </button>
      {/if}
    </div>
  {/if}

  {#if popup.detail && !replacing}
    <div class="detail">
      <div class="breadcrumb"><span>›</span><span>{annot.breadcrumb(popup.target)}</span></div>
      {#if quote}
        <div class="quote">“{quote}”</div>
      {/if}
      {#if annot.styleEdits.length > 0}
        <dl class="edits">
          {#each annot.styleEdits as edit (edit.selector + edit.property)}
            <dt>{edit.property}</dt>
            <dd>{edit.from} → {edit.to}</dd>
          {/each}
        </dl>
      {/if}
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
      </dl>
    </div>
  {/if}
</div>
