<script lang="ts">
  import { cornerStyle } from '../dom/geometry.js';
  import { comboOf, formatCombo } from '../keyboard.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import { trapFocus } from './focus.js';
  import RadioGroup from './RadioGroup.svelte';
  import Switch from './Switch.svelte';
  import type { Density, DetailLevel, MarkerVisibility, SchemeOption, SendMode } from '../options.js';

  let { annot, version }: { annot: AnnotState; version: string } = $props();

  const SEND: { value: SendMode; title: string; note: string }[] = [
    { value: 'manual', title: 'Manual', note: 'notes wait as drafts until you send them' },
    { value: 'review', title: 'Send, then review', note: 'sent as written; you approve the work' },
    { value: 'auto', title: 'Send and approve', note: 'sent as written; done is done' },
  ];

  const QUESTIONS = [
    { level: 0, note: 'none — the agent decides and says what it chose' },
    { level: 1, note: 'only when it is blocked' },
    { level: 2, note: 'when the answer would change what it builds' },
    { level: 3, note: 'freely' },
  ] as const;
  const SCHEMES: SchemeOption[] = ['auto', 'light', 'dark'];
  const DETAIL: DetailLevel[] = ['compact', 'standard', 'detailed'];
  const MARKERS: MarkerVisibility[] = ['all', 'dots', 'none'];
  const DENSITY: Density[] = ['comfortable', 'compact'];

  const style = $derived(cornerStyle(annot.prefs.corner, 76, annot.prefs.panelOpen ? 376 : 0));

  let capturing = $state(false);

  function capture(event: KeyboardEvent): void {
    if (!capturing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      capturing = false;
      annot.capturingKey = false;
      return;
    }
    const combo = comboOf(event);
    if (!combo) return;
    annot.setPref('paletteKey', combo);
    capturing = false;
    annot.capturingKey = false;
  }
</script>

{#snippet segment(title: string, options: readonly string[], current: string, pick: (value: string) => void)}
  <div class="setting">
    <span class="title">{title}</span>
    <div class="segment">
      {#each options as option (option)}
        <button aria-pressed={current === option} onclick={() => pick(option)}>{option}</button>
      {/each}
    </div>
  </div>
{/snippet}

<div class="card popover" {style} role="dialog" aria-label="Overlay settings" use:trapFocus>
  <RadioGroup
    label="Send mode"
    options={SEND}
    value={annot.prefs.sendMode}
    onpick={(v) => annot.setPref('sendMode', v)}
  />

  <div class="setting">
    <span class="title">Questions the agent may ask</span>
    <div class="segment">
      {#each QUESTIONS as option (option.level)}
        <button
          aria-label="Questions {option.level}"
          aria-pressed={annot.prefs.questions === option.level}
          onclick={() => annot.setPref('questions', option.level)}>{option.level}</button
        >
      {/each}
    </div>
    <span class="muted">{QUESTIONS[annot.prefs.questions].note}</span>
  </div>
  {@render segment('Scheme', SCHEMES, annot.prefs.scheme ?? 'auto', (v) =>
    annot.setPref('scheme', v as SchemeOption),
  )}

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

  {@render segment('Detail for the agent', DETAIL, annot.prefs.detail, (v) =>
    annot.setPref('detail', v as DetailLevel),
  )}
  {@render segment('Pins', MARKERS, annot.prefs.markers, (v) =>
    annot.setPref('markers', v as MarkerVisibility),
  )}
  {@render segment('Density', DENSITY, annot.prefs.density, (v) =>
    annot.setPref('density', v as Density),
  )}

  <div class="setting">
    <span class="title">Command palette</span>
    <button
      class="btn small"
      aria-label="Command palette shortcut"
      onclick={() => {
        capturing = true;
        annot.capturingKey = true;
      }}
      onkeydown={capture}
      onblur={() => {
        capturing = false;
        annot.capturingKey = false;
      }}
    >
      {capturing ? 'Press a chord…' : formatCombo(annot.prefs.paletteKey)}
    </button>
  </div>

  <div class="setting toggle">
    <span class="title">CSS Details</span>
    <Switch
      checked={annot.prefs.cssDetails}
      label="CSS details"
      onchange={(next) => annot.setPref('cssDetails', next)}
    />
  </div>

  <div class="setting toggle">
    <span class="title">Block Page Interactions</span>
    <Switch
      checked={annot.prefs.blockInteractions}
      label="Block page interactions"
      onchange={(next) => annot.setPref('blockInteractions', next)}
    />
  </div>

  <div class="row">
    <button class="btn quiet small" onclick={() => annot.setPref('corner', 'br')}>Reset pill position</button>
    <span class="spacer"></span>
    <span class="muted mono">v{version}</span>
  </div>
</div>
