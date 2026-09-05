<script lang="ts">
  import DemoNav from './DemoNav.svelte';
  import { defineShadowCard } from './shadow-card.js';

  defineShadowCard();

  const ROWS = [
    { name: 'Ada Lovelace', plan: 'Pro', seats: 3 },
    { name: 'Grace Hopper', plan: 'Team', seats: 12 },
    { name: 'Alan Turing', plan: 'Free', seats: 1 },
    { name: 'Radia Perlman', plan: 'Team', seats: 8 },
  ];

  let modalOpen = $state(false);
  let editing = $state('');
</script>

<DemoNav />

<div class="shell flex">
  <aside class="sidebar border-r p-4" aria-label="Sections">
    <p class="text-xs uppercase text-muted font-semibold">Workspace</p>
    <ul class="nav-list mt-2 flex flex-col gap-1">
      <li><a href="#overview" class="block px-3 py-2 rounded">Overview</a></li>
      <li><a href="#members" class="block px-3 py-2 rounded">Members</a></li>
      <li><a href="#settings" class="block px-3 py-2 rounded">Settings</a></li>
      <li><a href="#billing" class="block px-3 py-2 rounded">Billing</a></li>
    </ul>
  </aside>

  <main class="flex-1 pb-40">
    <header class="page-header sticky-top border-b bg-surface px-6 py-3 flex items-center justify-between">
      <h1 class="text-2xl font-semibold mt-0 mb-0">Members</h1>
      <button class="btn btn-primary" data-testid="invite" type="button" onclick={() => (modalOpen = true)}>
        Invite people
      </button>
    </header>

    <section class="px-6 py-10" id="overview" aria-labelledby="cards-heading">
      <h2 id="cards-heading" class="text-lg font-semibold mt-0 mb-4">Overview</h2>
      <div class="stats grid grid-cols-3 gap-4">
        <div class="stat border rounded-xl bg-surface p-6"><span class="text-xs uppercase text-muted">Seats</span><span class="block text-2xl font-bold">24</span></div>
        <div class="stat border rounded-xl bg-surface p-6"><span class="text-xs uppercase text-muted">Active</span><span class="block text-2xl font-bold">19</span></div>
        <div class="stat border rounded-xl bg-surface p-6"><span class="text-xs uppercase text-muted">Invites</span><span class="block text-2xl font-bold">5</span></div>
      </div>
    </section>

    <section class="px-6" id="members" aria-labelledby="table-heading">
      <h2 id="table-heading" class="text-lg font-semibold mb-4">People</h2>
      <table class="data">
        <thead>
          <tr><th>Name</th><th>Plan</th><th>Seats</th><th></th></tr>
        </thead>
        <tbody>
          {#each ROWS as row (row.name)}
            <tr data-row={row.name}>
              <td>{row.name}</td>
              <td>{row.plan}</td>
              <td>{row.seats}</td>
              <td><button class="btn btn-sm" type="button" onclick={() => (editing = row.name)}>Edit</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="text-sm text-muted mt-2" data-testid="editing">Editing: {editing || 'nobody'}</p>
    </section>

    <section class="px-6 py-10" id="settings" aria-labelledby="form-heading">
      <h2 id="form-heading" class="text-lg font-semibold mt-0 mb-4">Workspace settings</h2>
      <form class="grid gap-3 max-w-3xl">
        <label class="field">Team name <input class="input" type="text" name="team" value="Acme" /></label>
        <label class="field">Billing email <input class="input" type="email" name="billing" placeholder="you@company.com" /></label>
        <label class="field">Notes <textarea class="input" name="notes" rows="3"></textarea></label>
        <label class="field">Region
          <select class="input" name="region"><option>eu-west</option><option>us-east</option></select>
        </label>
        <button class="btn btn-primary" data-testid="save" type="button">Save Changes</button>
      </form>
    </section>

    <section class="px-6 pb-40" id="billing" aria-labelledby="motion-heading">
      <h2 id="motion-heading" class="text-lg font-semibold mt-0 mb-4">Motion and shadows</h2>
      <div class="flex gap-6 items-center">
        <div class="spinner" data-testid="spinner" aria-label="loading"></div>
        <!-- svelte-ignore a11y_media_has_caption -->
        <video class="clip border rounded-lg" data-testid="clip" width="200" height="120" autoplay loop muted playsinline></video>
        <shadow-card class="flex-1"></shadow-card>
      </div>
    </section>
  </main>
</div>

{#if modalOpen}
  <div class="scrim" role="presentation" onclick={() => (modalOpen = false)}></div>
  <div class="modal border rounded-xl bg-surface p-6" role="dialog" aria-modal="true" aria-label="Invite people" data-testid="modal">
    <h2 class="text-lg font-semibold mt-0 mb-4">Invite people</h2>
    <label class="field">Email <input class="input" type="email" name="invite" placeholder="them@company.com" /></label>
    <div class="flex gap-2 mt-4">
      <button class="btn btn-primary" type="button" onclick={() => (modalOpen = false)}>Send invite</button>
      <button class="btn" data-testid="modal-close" type="button" onclick={() => (modalOpen = false)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .shell { min-height: 100vh; align-items: stretch; }
  .sidebar { width: 200px; flex: none; background: var(--demo-surface); }
  .border-r { border-right: 1px solid var(--demo-line); }
  .nav-list { list-style: none; padding: 0; margin: 0; }
  .nav-list a { color: inherit; text-decoration: none; }
  .nav-list a:hover { background: var(--demo-ground); }
  .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--demo-line);
    border-top-color: var(--demo-accent);
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .clip { background: #202227; }
  .scrim { position: fixed; inset: 0; background: rgba(16, 18, 21, 0.4); z-index: 20; }
  .modal { position: fixed; top: 12vh; left: 50%; transform: translateX(-50%); width: min(420px, 90vw); z-index: 21; }
</style>
