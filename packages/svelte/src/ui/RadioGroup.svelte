<script lang="ts" generics="T extends string">
  let {
    label,
    options,
    value,
    onpick,
  }: {
    label: string;
    /** Each choice with the sentence that says what it does. */
    options: readonly { value: T; title: string; note: string }[];
    value: T;
    onpick: (next: T) => void;
  } = $props();
</script>

<div class="setting">
  <span class="title" id="annot-radio-{label}">{label}</span>
  <div class="radios" role="radiogroup" aria-labelledby="annot-radio-{label}">
    {#each options as option (option.value)}
      <button
        type="button"
        class="radio"
        role="radio"
        aria-checked={value === option.value}
        data-state={value === option.value ? 'checked' : 'unchecked'}
        onclick={() => onpick(option.value)}
      >
        <span class="mark"></span>
        <span class="text">
          <span class="radio-title">{option.title}</span>
          <span class="muted">{option.note}</span>
        </span>
      </button>
    {/each}
  </div>
</div>
