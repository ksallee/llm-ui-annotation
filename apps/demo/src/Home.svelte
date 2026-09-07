<script lang="ts">
  import DemoNav from './DemoNav.svelte';

  const PLANS = [
    { name: 'Free', price: '$0', blurb: 'For one person kicking the tyres.' },
    { name: 'Pro', price: '$29', blurb: 'For a designer and an agent, working together.' },
    { name: 'Team', price: '$99', blurb: 'For everyone who reviews what the agent did.' },
  ];

  const FEATURES = [
    { icon: '◉', title: 'Point at an element', body: 'Hover, click, say what should change.' },
    { icon: '❝', title: 'Select a run of text', body: 'Anchored by quote, prefix and suffix.' },
    { icon: '✎', title: 'Draw on the page', body: 'Strokes go to the agent as a screenshot.' },
  ];
</script>

<DemoNav />

<main class="mx-auto max-w-5xl px-6 py-10 pb-40">
  <header class="hero mb-8">
    <p class="text-xs uppercase text-accent font-semibold">Dev-time feedback</p>
    <h1 class="text-4xl font-bold mt-2">Ship the feedback loop</h1>
    <p class="lede text-lg text-muted max-w-prose mt-2">
      Cancel anytime, no questions asked. Point at anything on this page and tell the agent what
      should change.
    </p>
    <div class="flex gap-3 mt-4">
      <button class="btn btn-primary" data-testid="signup" type="button">Sign up</button>
      <button class="btn" type="button">Read the docs</button>
    </div>
  </header>

  <section class="pricing mb-8" aria-labelledby="pricing-heading">
    <h2 id="pricing-heading" class="text-2xl font-semibold mb-4">Pricing</h2>
    <div class="cards grid grid-cols-3 gap-10">
      {#each PLANS as plan (plan.name)}
        <article class="card border rounded-xl bg-surface p-6 shadow-sm" data-plan={plan.name}>
          <h3 class="text-lg font-semibold mt-0 mb-2">{plan.name}</h3>
          <p class="price text-2xl font-bold">{plan.price}<span class="text-sm text-muted"> / month</span></p>
          <p class="text-sm text-muted">{plan.blurb}</p>
          <button class="btn btn-sm mt-4" type="button">Choose {plan.name}</button>
        </article>
      {/each}
    </div>
  </section>

  <section class="features mb-8" aria-labelledby="features-heading">
    <h2 id="features-heading" class="text-2xl font-semibold mb-4">What you get</h2>
    <ul class="grid grid-cols-3 gap-10">
      {#each FEATURES as feature (feature.title)}
        <li class="feature flex gap-3 items-start border rounded-lg bg-surface p-4">
          <span class="icon text-lg" aria-hidden="true">{feature.icon}</span>
          <span>
            <span class="block font-semibold">{feature.title}</span>
            <span class="block text-sm text-muted">{feature.body}</span>
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <footer class="border-t mt-8 py-3 text-sm text-muted flex justify-between">
    <span>© Acme, forever</span>
    <a href="/prose/">Read the prose page</a>
  </footer>
</main>

<style>
  .icon {
    width: 24px;
    text-align: center;
  }
  footer a {
    color: inherit;
  }
</style>
