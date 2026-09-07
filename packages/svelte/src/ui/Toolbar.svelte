<script lang="ts">
  import type { Mode } from '@llm-ui-annotation/core';
  import { cornerStyle, nearestCorner } from '../dom/geometry.js';
  import type { AnnotState, Connection } from '../state/annot-state.svelte.js';
  import { dragBox } from './drag.js';
  import Icon from './Icon.svelte';
  import type { IconName } from '../icons.js';

  let {
    annot,
    onsend,
    onclose,
  }: { annot: AnnotState; onsend: () => void; onclose: () => void } = $props();

  const MODES: { mode: Mode; icon: IconName; label: string; key: string }[] = [
    { mode: 'element', icon: 'element', label: 'Element', key: 'E' },
    { mode: 'text', icon: 'text', label: 'Highlight', key: 'H' },
    { mode: 'page', icon: 'page', label: 'Draw', key: 'D' },
  ];

  const CONNECTION: Record<Connection, string> = {
    connected: 'dev server connected',
    polling: 'polling',
    offline: 'dev server not reachable',
  };

  let dragging = $state<{ x: number; y: number } | null>(null);

  const style = $derived(
    dragging
      ? `left: ${dragging.x}px; top: ${dragging.y}px; right: auto; bottom: auto;`
      : cornerStyle(annot.prefs.corner, 20, annot.prefs.panelOpen ? 376 : 0),
  );

  // A tooltip renders above its button; near the top of the viewport there is no room for one.
  const tipsBelow = $derived(
    dragging ? dragging.y < 48 : annot.prefs.corner === 'tl' || annot.prefs.corner === 'tr',
  );

  function startDrag(event: PointerEvent): void {
    const pill = (event.currentTarget as HTMLElement).closest('.pill') as HTMLElement | null;
    const view = annot.doc.defaultView;
    if (!pill || !view) return;
    dragBox(
      view,
      event,
      pill.getBoundingClientRect(),
      (at) => (dragging = at),
      (_, e) => {
        annot.setPref(
          'corner',
          nearestCorner({ x: e.clientX, y: e.clientY }, { width: view.innerWidth, height: view.innerHeight }),
        );
        dragging = null;
      },
    );
  }
</script>

<div class="pill" class:tips-below={tipsBelow} {style} role="toolbar" aria-label="Annotation toolbar">
  {#if !annot.prefs.expanded}
    <button
      class="icon-btn"
      aria-label="Open the annotation toolbar"
      onclick={() => annot.setPref('expanded', true)}
    >
      <Icon name="logo" />
      {#if annot.badge > 0}<span class="badge">{annot.badge}</span>{/if}
    </button>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="grip" onpointerdown={startDrag} aria-hidden="true"><Icon name="grip" size={16} /></span>

    {#each MODES as item (item.mode)}
      <button
        class="icon-btn"
        aria-pressed={annot.mode === item.mode}
        aria-label="{item.label} mode"
        onclick={() => annot.setMode(item.mode)}
      >
        <Icon name={item.icon} />
        <span class="tooltip">{item.label}<kbd>{item.key}</kbd></span>
      </button>
    {/each}

    {#if annot.mode === 'element'}
      <button
        class="icon-btn"
        aria-pressed={annot.picking}
        aria-label="Point at elements"
        onclick={() => (annot.picking = !annot.picking)}
      >
        <Icon name="pick" />
        <span class="tooltip">{annot.picking ? 'Stop pointing' : 'Point at elements'}<kbd>C</kbd></span>
      </button>
    {/if}

    <span class="divider"></span>

    <button class="icon-btn" aria-label="Pin visibility: {annot.prefs.markers}" onclick={() => annot.cycleMarkers()}>
      <Icon name={annot.prefs.markers === 'none' ? 'eye-off' : 'eye'} />
      <span class="tooltip">Pins: {annot.prefs.markers}</span>
    </button>

    <button
      class="icon-btn"
      aria-pressed={annot.frozen}
      aria-label="Pause animations"
      onclick={() => (annot.frozen = !annot.frozen)}
    >
      <Icon name={annot.frozen ? 'play' : 'pause'} />
      <span class="tooltip">{annot.frozen ? 'Resume' : 'Pause'} animations<kbd>⇧P</kbd></span>
    </button>

    {#if annot.sendMode === 'manual'}
      <button
        class="icon-btn send-btn"
        aria-label="Send {annot.drafts.length} annotation{annot.drafts.length === 1 ? '' : 's'}"
        disabled={annot.drafts.length === 0}
        onclick={onsend}
      >
        <Icon name="send" />
        <span class="count">{annot.drafts.length}</span>
        <span class="tooltip">Send<kbd>⌘↵</kbd></span>
      </button>
    {/if}

    <button
      class="icon-btn"
      aria-pressed={annot.prefs.panelOpen}
      aria-label="Toggle the annotations panel"
      onclick={() => annot.togglePanel()}
    >
      <Icon name="inbox" />
      {#if annot.needsYou.length > 0}<span class="badge">{annot.needsYou.length}</span>{/if}
      <span class="tooltip">Panel<kbd>I</kbd></span>
    </button>

    <span class="divider"></span>

    <button
      class="icon-btn"
      aria-pressed={annot.settingsOpen}
      aria-label="Settings"
      onclick={() => (annot.settingsOpen = !annot.settingsOpen)}
    >
      <Icon name="gear" />
      <span class="tooltip">Settings</span>
    </button>

    {#if annot.connection !== 'connected'}
      <span
        class="dot {annot.connection}"
        title={CONNECTION[annot.connection]}
        aria-label={CONNECTION[annot.connection]}
        role="status"
      ></span>
    {/if}

    <button class="icon-btn" aria-label="Collapse the toolbar" onclick={onclose}>
      <Icon name="close" />
      <span class="tooltip">Close<kbd>Esc</kbd></span>
    </button>
  {/if}
</div>
