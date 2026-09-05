<script lang="ts">
  const ACCENTS = ['#f2b705', '#4f46e5', '#c2255c'];

  function apply(value: string): void {
    document.documentElement.style.setProperty('--annot-accent', value);
  }
</script>

<nav class="hostile-nav" aria-label="Demo">
  <span class="brand">Acme, unset</span>
  {#each ACCENTS as value (value)}
    <button
      type="button"
      class="swatch"
      data-testid={`accent-${value.slice(1)}`}
      aria-label={`Accent ${value}`}
      style={`background:${value}`}
      onclick={() => apply(value)}
    ></button>
  {/each}
  <input
    id="accent-picker"
    type="color"
    aria-label="Host accent"
    value="#f2b705"
    oninput={(e) => apply((e.currentTarget as HTMLInputElement).value)}
  />
</nav>

<main>
  <h1>Hostile host</h1>
  <p class="lede">
    This page resets every element with <code>* &#123; all: unset &#125;</code> and declares a dark
    colour scheme with a loud accent. The overlay must still look like itself, and must leave this
    document exactly as it found it.
  </p>
  <button data-testid="hostile-cta" type="button">Do the thing</button>
  <p>
    A second paragraph, so Highlight mode has something to select on a page where every element has lost
    its defaults.
  </p>
</main>

<style>
  .swatch {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid #555;
    cursor: pointer;
  }
</style>
