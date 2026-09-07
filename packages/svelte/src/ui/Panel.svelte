<script lang="ts">
  import type { AnnotState, BulkAction, Filter } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';
  import Icon from './Icon.svelte';
  import type { IconName } from '../icons.js';
  import Inspector from './Inspector.svelte';
  import PanelRow from './PanelRow.svelte';

  let {
    annot,
    onsend,
    onlocate,
  }: { annot: AnnotState; onsend: () => void; onlocate: (id: string) => void } = $props();

  const sendable = $derived(annot.drafts.length - annot.draftsNeedingComment.length);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'needs-you', label: 'Needs you' },
    { id: 'open', label: 'Open' },
    { id: 'done', label: 'Done' },
    { id: 'all', label: 'All' },
  ];

  const BULK: { id: BulkAction; label: string; icon: IconName }[] = [
    { id: 'approve', label: 'Approve', icon: 'check-all' },
    { id: 'reopen', label: 'Reopen', icon: 'reopen' },
    { id: 'send', label: 'Send', icon: 'send' },
    { id: 'delete', label: 'Delete', icon: 'trash' },
  ];

  const shown = $derived(annot.filtered);
  const picked = $derived(annot.selected.size);
  const notes = $derived(annot.channel === 'notes');
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="panel"
  class:selecting={picked > 0}
  role="dialog"
  tabindex="-1"
  aria-label="Annotations"
  use:trapFocus
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      annot.selectAllFiltered();
    }
  }}
>
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
    <div class="channels" role="group" aria-label="Panel channel">
      <button
        class="channel"
        aria-label="Notes channel"
        aria-pressed={notes}
        onclick={() => annot.setChannel('notes')}>Notes</button
      >
      <button
        class="channel"
        aria-label="Inspect channel"
        aria-pressed={!notes}
        onclick={() => annot.setChannel('inspect')}>Inspect</button
      >
    </div>

    {#if notes}
      <div class="chips">
        {#each FILTERS as filter (filter.id)}
          <button
            class="filter-chip"
            aria-pressed={annot.panelFilter === filter.id}
            onclick={() => annot.setFilter(filter.id)}
          >
            {filter.label}
            <span class="n">{annot.filterCounts[filter.id]}</span>
          </button>
        {/each}
      </div>
    {/if}
  </header>

  {#if !notes}
    <Inspector {annot} />
  {:else}
    <div class="rows">
      {#if picked > 0}
        <div class="bulk" role="group" aria-label="Bulk actions">
          <div class="row">
            <span class="muted mono">{picked} selected</span>
            <span class="spacer"></span>
            <button class="btn quiet small" onclick={() => annot.clearSelection()}>Clear</button>
          </div>
          <div class="row wrap">
            {#each BULK as action (action.id)}
              {@const bulk = annot.bulk[action.id]}
              <button
                class="btn small"
                class:primary={action.id === 'approve'}
                disabled={!bulk.enabled}
                onclick={() => void annot.runBulk(action.id)}
              >
                <Icon name={action.icon} size={14} />
                {action.label} ({bulk.count < bulk.total ? `${bulk.count} of ${bulk.total}` : bulk.count})
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#each shown as a (a.id)}
        <PanelRow
          {annot}
          annotation={a}
          expanded={annot.expandedId === a.id}
          ontoggle={() => {
            annot.expandedId = annot.expandedId === a.id ? null : a.id;
            if (annot.expandedId) onlocate(a.id);
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
        <button class="btn primary small" disabled={sendable === 0} onclick={onsend}>
          <Icon name="send" size={14} />
          {annot.draftsNeedingComment.length > 0
            ? `Send drafts (${sendable}, ${annot.draftsNeedingComment.length} need a comment)`
            : `Send drafts (${sendable})`}
        </button>
      {/if}
    </footer>
  {/if}
</div>
