<script lang="ts">
  import type { Status } from '@llm-ui-annotation/core';
  import type { AnnotState, Filter } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';
  import Icon from './Icon.svelte';
  import PanelRow from './PanelRow.svelte';

  let {
    annot,
    onsend,
    onlocate,
  }: { annot: AnnotState; onsend: () => void; onlocate: (id: string) => void } = $props();

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'needs-you', label: 'Needs you' },
    { id: 'open', label: 'Open' },
    { id: 'done', label: 'Done' },
    { id: 'all', label: 'All' },
  ];

  let expanded = $state<string | null>(null);

  const shown = $derived(annot.filtered);
  const counts = $derived(annot.counts);
  const order: Status[] = ['draft', 'sent', 'acknowledged', 'question', 'review', 'approved'];
</script>

<div class="panel" role="dialog"
  tabindex="-1" aria-label="Annotations" use:trapFocus>
  <header>
    <div class="row">
      <span class="mono">{annot.route}</span>
      {#if annot.connection !== 'connected'}
        <span class="status-pill plain" style="background: var(--annot-question-fill)">
          {annot.connection === 'offline' ? 'dev server not reachable' : 'polling'}
        </span>
      {/if}
      <span class="spacer"></span>
      <button
        class="btn quiet small"
        aria-pressed={annot.allRoutes}
        onclick={() => void annot.toggleAllRoutes()}>all routes</button
      >
      <button
        class="icon-btn"
        style="width: 24px; height: 24px"
        aria-label="Close the panel"
        onclick={() => annot.togglePanel(false)}><Icon name="close" size={16} /></button
      >
    </div>
    <div class="row muted" style="font-size: 11.5px; gap: 8px; flex-wrap: wrap">
      {#each order as status (status)}
        {#if counts[status] > 0}
          <span class="status-pill" style="background: var(--annot-{status}-fill)">
            {counts[status]}
            {status}
          </span>
        {/if}
      {/each}
    </div>
    <div class="chips">
      {#each FILTERS as filter (filter.id)}
        <button
          class="filter-chip"
          aria-pressed={annot.panelFilter === filter.id}
          onclick={() => annot.setFilter(filter.id)}>{filter.label}</button
        >
      {/each}
    </div>
  </header>

  <div class="rows">
    {#each shown as a (a.id)}
      <PanelRow
        {annot}
        annotation={a}
        expanded={expanded === a.id}
        ontoggle={() => {
          expanded = expanded === a.id ? null : a.id;
          if (expanded) onlocate(a.id);
        }}
        onlocate={() => onlocate(a.id)}
      />
    {:else}
      <div class="muted" style="padding: 24px; text-align: center">Nothing here.</div>
    {/each}
  </div>

  <footer>
    <button
      class="btn small"
      disabled={annot.inReview.length === 0}
      onclick={() => void annot.approveAll()}
    >
      <Icon name="check-all" size={14} /> Approve all ({annot.inReview.length})
    </button>
    {#if annot.sendMode === 'batch'}
      <button class="btn primary small" disabled={annot.drafts.length === 0} onclick={onsend}>
        <Icon name="send" size={14} /> Send drafts ({annot.drafts.length})
      </button>
    {/if}
  </footer>
</div>
