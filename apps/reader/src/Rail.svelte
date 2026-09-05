<script lang="ts">
  import type { Scheme } from '@llm-ui-annotation/core/theme';
  import type { DocRegion } from './render.js';
  import { MAX_STEP, MIN_STEP, type ReaderPrefs } from './theme.js';

  interface Props {
    title: string;
    name: string;
    sections: DocRegion[];
    notes: number;
    prefs: ReaderPrefs;
    onscheme: (scheme: Scheme) => void;
    onfont: (delta: number) => void;
  }

  let { title, name, sections, notes, prefs, onscheme, onfont }: Props = $props();

  const SCHEMES: { value: Scheme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Auto' },
  ];
</script>

<aside class="rail">
  <h1>{title || name}</h1>
  <p class="file">{name}</p>

  <nav aria-label="Sections">
    {#each sections as section (section.key)}
      <a href="#sec-{section.key}">{section.title}</a>
    {/each}
  </nav>

  <div class="group notes">
    <span class="label">Notes</span>
    <span class="count" data-testid="notes-count">{notes}</span>
  </div>

  <div class="group">
    <span class="label">Text size</span>
    <button
      type="button"
      aria-label="Smaller text"
      disabled={prefs.fontStep <= MIN_STEP}
      onclick={() => onfont(-1)}>−</button
    >
    <button
      type="button"
      aria-label="Larger text"
      disabled={prefs.fontStep >= MAX_STEP}
      onclick={() => onfont(1)}>+</button
    >
  </div>

  <div class="group">
    <span class="label">Theme</span>
    {#each SCHEMES as option (option.value)}
      <button
        type="button"
        aria-pressed={prefs.scheme === option.value}
        onclick={() => onscheme(option.value)}>{option.label}</button
      >
    {/each}
  </div>

  <p class="hint">
    Select a passage to leave a note. <kbd>T</kbd> text, <kbd>E</kbd> element, <kbd>P</kbd> page,
    <kbd>I</kbd> for the panel.
  </p>
</aside>
