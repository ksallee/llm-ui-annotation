<script lang="ts">
  const ACCENTS = [
    { name: 'teal', value: '#2c8a85' },
    { name: 'indigo', value: '#4f46e5' },
    { name: 'amber', value: '#f2b705' },
    { name: 'crimson', value: '#c2255c' },
  ];

  let accent = $state(ACCENTS[0]!.value);

  function apply(value: string): void {
    accent = value;
    const root = document.documentElement;
    root.style.setProperty('--annot-accent', value);
    root.style.setProperty('--demo-accent', value);
  }
</script>

<nav class="demo-nav flex items-center gap-4 px-6 py-3 border-b bg-surface sticky-top" aria-label="Demo">
  <span class="font-bold">Acme</span>
  <a href="/" class="text-sm">Home</a>
  <a href="/app/" class="text-sm">Dashboard</a>
  <a href="/prose/" class="text-sm">Prose</a>
  <a href="/layout/" class="text-sm">Layout</a>
  <a href="/hostile/" class="text-sm">Hostile</a>
  <span class="flex-1"></span>
  <span class="text-xs text-muted uppercase">Accent</span>
  {#each ACCENTS as swatch (swatch.name)}
    <button
      type="button"
      class="swatch"
      data-testid={`accent-${swatch.name}`}
      aria-label={`Accent ${swatch.name}`}
      style={`background:${swatch.value}`}
      onclick={() => apply(swatch.value)}
    ></button>
  {/each}
  <input
    id="accent-picker"
    type="color"
    aria-label="Host accent"
    value={accent}
    oninput={(e) => apply((e.currentTarget as HTMLInputElement).value)}
  />
</nav>

<style>
  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    cursor: pointer;
    padding: 0;
  }
  nav a {
    color: inherit;
    text-decoration: none;
  }
</style>
