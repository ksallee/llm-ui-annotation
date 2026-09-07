<script lang="ts">
  let {
    checked,
    label,
    onchange,
  }: { checked: boolean; label: string; onchange: (next: boolean) => void } = $props();

  const state = $derived(checked ? 'checked' : 'unchecked');
</script>

<button
  type="button"
  role="switch"
  class="switch"
  data-state={state}
  aria-checked={checked}
  aria-label={label}
  onclick={() => onchange(!checked)}
>
  <span class="switch-thumb" data-state={state}></span>
</button>
