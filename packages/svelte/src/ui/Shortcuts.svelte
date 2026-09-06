<script lang="ts">
  import { SHORTCUTS } from '../keyboard.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';

  let { annot }: { annot: AnnotState } = $props();

  const groups = $derived.by(() => {
    const by = new Map<string, typeof SHORTCUTS>();
    for (const s of SHORTCUTS) by.set(s.scope, [...(by.get(s.scope) ?? []), s]);
    return [...by];
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" onclick={(e) => e.target === e.currentTarget && (annot.shortcutsOpen = false)}>
  <div class="card dialog shortcut-sheet" role="dialog"
  tabindex="-1" aria-label="Keyboard shortcuts" use:trapFocus>
    <h2>Keyboard shortcuts</h2>
    {#each groups as [scope, entries] (scope)}
      <div class="group">
        <div class="group-name">{scope}</div>
        <ul>
          {#each entries as shortcut (shortcut.keys)}
            <li>
              <kbd>{shortcut.keys}</kbd>
              <span>{shortcut.what}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
    <div class="row end">
      <button class="btn" onclick={() => (annot.shortcutsOpen = false)}>Close</button>
    </div>
  </div>
</div>
