<script lang="ts">
  import { SHORTCUTS } from '../keyboard.js';
  import type { AnnotState } from '../annot/annot-annot.svelte.js';
  import { trapFocus } from './focus.js';

  let { annot }: { annot: AnnotState } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" onclick={(e) => e.target === e.currentTarget && (annot.shortcutsOpen = false)}>
  <div class="card dialog" role="dialog"
  tabindex="-1" aria-label="Keyboard shortcuts" use:trapFocus>
    <h2>Keyboard shortcuts</h2>
    <ul>
      {#each SHORTCUTS as shortcut (shortcut.keys)}
        <li><kbd class="mono">{shortcut.keys}</kbd><span>{shortcut.what}</span></li>
      {/each}
    </ul>
    <div class="row end">
      <button class="btn" onclick={() => (annot.shortcutsOpen = false)}>Close</button>
    </div>
  </div>
</div>
