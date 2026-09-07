<script lang="ts">
  import type { Scheme } from '@llm-ui-annotation/core/theme';
  import type { MountedOverlay } from '@llm-ui-annotation/svelte';
  import Document from './Document.svelte';
  import Rail from './Rail.svelte';
  import type { DocPayload } from './doc-protocol.js';
  import { watchDoc, type HotLike } from './doc.js';
  import { renderDoc } from './render.js';
  import { applyReaderTheme, loadPrefs, nextStep, savePrefs, type ReaderPrefs } from './theme.js';

  interface Props {
    initial: DocPayload;
    overlay: MountedOverlay | null;
    hot?: HotLike | undefined;
  }

  let { initial, overlay, hot }: Props = $props();

  // svelte-ignore state_referenced_locally
  let payload = $state<DocPayload>(initial);
  let prefs = $state<ReaderPrefs>(loadPrefs(window));
  let notes = $state(0);

  const model = $derived(renderDoc(payload.markdown));

  // svelte-ignore state_referenced_locally
  watchDoc(hot, (next) => {
    payload = next;
  });

  function update(next: ReaderPrefs): void {
    prefs = next;
    savePrefs(window, next);
    applyReaderTheme(document, next);
  }

  $effect(() => {
    const timer = setInterval(() => {
      notes = overlay?.state?.visible.length ?? 0;
    }, 300);
    return () => clearInterval(timer);
  });

  $effect(() => {
    document.title = model.title || payload.name;
  });
</script>

<div class="shell">
  <Rail
    title={model.title}
    name={payload.name}
    sections={model.sections}
    {notes}
    {prefs}
    onscheme={(scheme: Scheme) => update({ ...prefs, scheme })}
    onfont={(delta: number) => update({ ...prefs, fontStep: nextStep(prefs.fontStep, delta) })}
  />
  <main>
    <Document {model} />
  </main>
</div>
