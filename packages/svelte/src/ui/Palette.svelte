<script lang="ts">
  // The command palette: search and run any overlay action.
  import { filterEntries, paletteEntries } from '../palette.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';

  let { annot, onlocate }: { annot: AnnotState; onlocate: (id: string) => void } = $props();

  let query = $state('');
  let cursor = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  const entries = $derived(paletteEntries(annot, onlocate));
  const hits = $derived(filterEntries(entries, query));
  const active = $derived(hits[Math.min(cursor, hits.length - 1)] ?? null);

  $effect(() => {
    input?.focus();
  });

  function close(): void {
    annot.togglePalette(false);
  }

  function run(): void {
    const chosen = active;
    if (!chosen) return;
    close();
    chosen.run();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      cursor = hits.length === 0 ? 0 : (cursor + step + hits.length) % hits.length;
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      run();
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim palette-scrim" onclick={(e) => e.target === e.currentTarget && close()}>
  <div class="card palette" role="dialog" tabindex="-1" aria-label="Command palette" use:trapFocus>
    <input
      class="field"
      bind:this={input}
      bind:value={query}
      oninput={() => (cursor = 0)}
      {onkeydown}
      placeholder="Jump to a mode, a filter or an annotation…"
      aria-label="Search commands"
      aria-controls="annot-palette-list"
      autocomplete="off"
    />
    <ul class="palette-list" id="annot-palette-list">
      {#each hits.slice(0, 40) as hit, i (hit.id)}
        <li>
          <button
            class="palette-row"
            class:on={hit === active}
            onmousemove={() => (cursor = i)}
            onclick={() => {
              cursor = i;
              run();
            }}
          >
            {#if hit.color}
              <span class="swatch static" style="background: {hit.color}"></span>
            {/if}
            <span class="palette-label">{hit.label}</span>
            <span class="palette-kind muted">{hit.kind}</span>
            {#if hit.hint}<kbd>{hit.hint}</kbd>{/if}
          </button>
        </li>
      {:else}
        <li class="muted" style="padding: 12px">Nothing matches.</li>
      {/each}
    </ul>
  </div>
</div>
