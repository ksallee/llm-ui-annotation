<script lang="ts">
  import { formatBytes, type Attachment } from '@llm-ui-annotation/core';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';

  let {
    annot,
    id,
    items,
  }: { annot: AnnotState; id: string; items: Attachment[] } = $props();
</script>

{#if items.length > 0 || annot.attaching.has(id)}
  <div class="attachments" aria-label="Attachments">
    {#each items as item (item.id)}
      <span class="attachment">
        <a
          class="open"
          href={annot.client.attachmentUrl(id, item.id)}
          target="_blank"
          rel="noreferrer"
          aria-label="Open {item.name}"
          title="{item.name} · {formatBytes(item.bytes)}"
        >
          {#if item.type.startsWith('image/')}
            <img class="att-thumb" src={annot.client.attachmentUrl(id, item.id)} alt="" />
          {:else}
            <Icon name="file" size={16} />
          {/if}
          <span class="att-name">{item.name}</span>
          <span class="att-size">{formatBytes(item.bytes)}</span>
        </a>
        <button
          class="att-remove"
          aria-label="Remove {item.name}"
          onclick={() => void annot.detach(id, item.id)}
        >
          <Icon name="close" size={12} />
        </button>
      </span>
    {/each}
    {#if annot.attaching.has(id)}
      <span class="attachment pending"><span class="att-name">attaching…</span></span>
    {/if}
  </div>
{/if}
