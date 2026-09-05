declare module '*.css?raw' {
  const css: string;
  export default css;
}

declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component<Record<string, unknown>>;
  export default component;
}
