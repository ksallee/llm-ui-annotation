<script lang="ts">
  import DemoNav from './DemoNav.svelte';

  const BAYS = [
    {
      id: 'row-gap-token',
      title: 'Flex row, one token',
      note: 'gap: var(--demo-space-4)',
      tiles: 4,
    },
    { id: 'row-gap-rem', title: 'Flex row, the same gap in rem', note: 'gap: 1rem', tiles: 4 },
    { id: 'row-gap-loose', title: 'Flex row, off the system', note: 'gap: 18px', tiles: 4 },
    {
      id: 'column-stack',
      title: 'Flex column',
      note: 'flex-direction: column; gap: var(--demo-space-2)',
      tiles: 3,
    },
    {
      id: 'wrap-shelf',
      title: 'Flex wrap, two values',
      note: 'gap: var(--demo-space-2) var(--demo-space-6)',
      tiles: 7,
    },
    {
      id: 'card-grid',
      title: 'Grid, one token',
      note: 'grid-template-columns: repeat(3, …); gap: var(--demo-space-5)',
      tiles: 6,
    },
    {
      id: 'split-grid',
      title: 'Grid, each axis its own property',
      note: 'row-gap: var(--demo-space-3); column-gap: var(--demo-space-7)',
      tiles: 4,
    },
  ];
</script>

<DemoNav />

<main class="mx-auto max-w-5xl px-6 py-10 pb-40 column-stack">
  <h1 class="text-4xl font-bold mt-0">Gaps</h1>
  <p class="text-muted max-w-prose">
    One container per way a page writes a gap. Point at a container, not a tile: the panel should
    read back the property the stylesheet declares, with the token it names.
  </p>

  {#each BAYS as bay (bay.id)}
    <section class="bay column-stack" data-testid="bay-{bay.id}">
      <h2 class="text-lg font-semibold mt-0 mb-0">{bay.title}</h2>
      <code class="text-xs text-muted">{bay.note}</code>
      <div class={bay.id} data-testid={bay.id}>
        {#each Array.from({ length: bay.tiles }, (_, i) => i + 1) as n (n)}
          <div class="tile">Tile {n}</div>
        {/each}
      </div>
    </section>
  {/each}

  <section class="bay column-stack" data-testid="bay-nested">
    <h2 class="text-lg font-semibold mt-0 mb-0">A grid inside a flex item</h2>
    <code class="text-xs text-muted">gap: var(--demo-space-1), two levels down</code>
    <div class="row-gap-token" data-testid="nest-outer">
      <div class="tile nested-grid" data-testid="nest-inner">
        <span>One</span>
        <span>Two</span>
        <span>Three</span>
        <span>Four</span>
      </div>
      <div class="tile">Sibling</div>
    </div>
  </section>
</main>
