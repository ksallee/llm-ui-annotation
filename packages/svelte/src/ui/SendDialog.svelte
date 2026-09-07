<script lang="ts">
  import { summarizeTarget } from '@llm-ui-annotation/core';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';
  import Icon from './Icon.svelte';
  import { MODE_ICON } from './mode-icon.js';

  let { annot }: { annot: AnnotState } = $props();

  let summary = $state('');

  const drafts = $derived(annot.drafts);
  const sendable = $derived(drafts.length - annot.draftsNeedingComment.length);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" onclick={(e) => e.target === e.currentTarget && (annot.sendOpen = false)}>
  <div
    class="card dialog"
    role="dialog"
  tabindex="-1"
    aria-label="Send annotations"
    use:trapFocus
    onkeydown={(e) => {
      if (e.key === 'Escape') annot.sendOpen = false;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void annot.sendDrafts(summary.trim() || null);
    }}
  >
    <h2>Send {drafts.length} annotation{drafts.length === 1 ? '' : 's'}</h2>
    <ul>
      {#each drafts as a (a.id)}
        <li>
          <span class="num">#{a.number}</span>
          <Icon name={MODE_ICON[a.mode]} size={14} />
          <span class="target">{a.comment.slice(0, 60) || summarizeTarget(a.target)}</span>
        </li>
      {/each}
    </ul>
    <textarea
      class="field"
      rows="3"
      bind:value={summary}
      placeholder="Anything the agent should know about this batch?"
      aria-label="Batch summary"
    ></textarea>
    {#if annot.draftsNeedingComment.length > 0}
      <div class="muted">
        {annot.draftsNeedingComment.length} draft{annot.draftsNeedingComment.length === 1 ? '' : 's'} still
        {annot.draftsNeedingComment.length === 1 ? 'needs' : 'need'} a comment and will not be sent.
      </div>
    {/if}
    {#if annot.otherRouteDrafts > 0}
      <div class="muted">{annot.otherRouteDrafts} draft(s) on other routes are not included.</div>
    {/if}
    <div class="row end">
      <button class="btn" onclick={() => (annot.sendOpen = false)}>Cancel</button>
      <button
        class="btn primary"
        disabled={sendable === 0}
        onclick={() => void annot.sendDrafts(summary.trim() || null)}
      >
        Send {sendable} annotation{sendable === 1 ? '' : 's'}
      </button>
    </div>
  </div>
</div>
