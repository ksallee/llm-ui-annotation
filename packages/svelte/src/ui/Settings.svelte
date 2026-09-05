<script lang="ts">
  import { cornerStyle } from '../dom/geometry.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';
  import type { Density, DetailLevel, MarkerVisibility, SchemeOption, SendMode } from '../options.js';

  let { annot, version }: { annot: AnnotState; version: string } = $props();

  const SEND: SendMode[] = ['batch', 'immediate'];
  const SCHEMES: SchemeOption[] = ['auto', 'light', 'dark'];
  const DETAIL: DetailLevel[] = ['compact', 'standard', 'detailed'];
  const MARKERS: MarkerVisibility[] = ['all', 'dots', 'none'];
  const DENSITY: Density[] = ['comfortable', 'compact'];

  const style = $derived(cornerStyle(annot.prefs.corner, 76, annot.prefs.panelOpen ? 376 : 0));
</script>

<div class="card popover" {style} role="dialog" aria-label="Overlay settings" use:trapFocus>
  <div class="setting">
    <span class="title">Send mode</span>
    <div class="segment">
      {#each SEND as mode (mode)}
        <button aria-pressed={annot.prefs.sendMode === mode} onclick={() => annot.setPref('sendMode', mode)}>
          {mode}
        </button>
      {/each}
    </div>
  </div>

  <div class="setting">
    <span class="title">Scheme</span>
    <div class="segment">
      {#each SCHEMES as scheme (scheme)}
        <button
          aria-pressed={(annot.prefs.scheme ?? 'auto') === scheme}
          onclick={() => annot.setPref('scheme', scheme)}>{scheme}</button
        >
      {/each}
    </div>
  </div>

  <div class="setting">
    <span class="title">Accent</span>
    <div class="swatches">
      {#each annot.accentSuggestions as accent (accent)}
        <button
          class="swatch"
          style="background: {accent}; border-color: var(--annot-line)"
          aria-label="Accent {accent}"
          aria-pressed={annot.prefs.accent === accent}
          onclick={() => annot.setPref('accent', accent)}
        ></button>
      {/each}
      <input
        type="color"
        aria-label="Custom accent"
        onchange={(e) => annot.setPref('accent', (e.currentTarget as HTMLInputElement).value)}
      />
      <button class="btn quiet small" onclick={() => annot.setPref('accent', null)}>follow host</button>
    </div>
  </div>

  <div class="setting">
    <span class="title">Detail for the agent</span>
    <div class="segment">
      {#each DETAIL as level (level)}
        <button aria-pressed={annot.prefs.detail === level} onclick={() => annot.setPref('detail', level)}>
          {level}
        </button>
      {/each}
    </div>
  </div>

  <div class="setting">
    <span class="title">Pins</span>
    <div class="segment">
      {#each MARKERS as markers (markers)}
        <button aria-pressed={annot.prefs.markers === markers} onclick={() => annot.setPref('markers', markers)}>
          {markers}
        </button>
      {/each}
    </div>
  </div>

  <div class="setting">
    <span class="title">Density</span>
    <div class="segment">
      {#each DENSITY as density (density)}
        <button aria-pressed={annot.prefs.density === density} onclick={() => annot.setPref('density', density)}>
          {density}
        </button>
      {/each}
    </div>
  </div>

  <label class="row">
    <input
      type="checkbox"
      checked={annot.prefs.blockInteractions}
      onchange={(e) => annot.setPref('blockInteractions', (e.currentTarget as HTMLInputElement).checked)}
    />
    <span>Block page interactions while a mode is active</span>
  </label>

  <div class="row">
    <button class="btn quiet small" onclick={() => annot.setPref('corner', 'br')}>Reset pill position</button>
    <span class="spacer"></span>
    <span class="muted mono">v{version}</span>
  </div>
</div>
