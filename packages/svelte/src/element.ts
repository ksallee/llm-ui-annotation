import { mount as mountComponent, unmount } from 'svelte';
import { OVERLAY_TAG } from './dom/core-dom.js';
import { ATTRIBUTES, optionsFromAttributes, type OverlayOptions } from './options.js';
import { createState } from './create.js';
import type { AnnotState } from './state/annot-state.svelte.js';
import { connectLive } from './transport/live.js';
import Annotator from './ui/Annotator.svelte';
import { VERSION } from './version.js';

const HOST_STYLE = [
  'all: initial',
  'display: block',
  'position: fixed',
  'inset: 0',
  'width: 0',
  'height: 0',
  'overflow: visible',
  'z-index: 2147483000',
  'pointer-events: none',
  'color-scheme: normal',
].join('; ');

/**
 * `<annot-overlay>`. Written by hand rather than compiled with `customElement: true` so the shadow
 * root, the host styles and the props stay under our control in any bundler.
 */
export class AnnotOverlayElement extends HTMLElement {
  static readonly observedAttributes = ATTRIBUTES;

  /** Options that cannot be expressed as attributes, set before the element is connected. */
  options: OverlayOptions = {};

  #app: Record<string, unknown> | null = null;
  #state: AnnotState | null = null;
  #stopLive: (() => void) | null = null;

  get state(): AnnotState | null {
    return this.#state;
  }

  connectedCallback(): void {
    if (this.#app) return;
    this.style.cssText = HOST_STYLE;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const options: OverlayOptions = { ...optionsFromAttributes(this), ...this.options };
    const state = createState(options);
    this.#state = state;
    this.#stopLive = connectLive(state, state.client, { hot: options.hot ?? null });
    this.#app = mountComponent(Annotator, {
      target: shadow,
      props: { state, options, version: VERSION },
    }) as Record<string, unknown>;
  }

  disconnectedCallback(): void {
    this.#stopLive?.();
    this.#stopLive = null;
    if (this.#app) void unmount(this.#app);
    this.#app = null;
    this.#state = null;
  }

  /** Push options onto an overlay that is already running. */
  applyOptions(options: OverlayOptions): void {
    const state = this.#state;
    if (!state) return;
    if (options.accent) state.setPref('accent', options.accent);
    if (options.scheme) state.setPref('scheme', options.scheme);
    if (options.sendMode) state.setPref('sendMode', options.sendMode);
    if (options.density) state.setPref('density', options.density);
    if (options.mode) state.mode = options.mode;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    const state = this.#state;
    if (!state) return;
    if (name === 'accent') state.setPref('accent', value);
    if (name === 'scheme' && (value === 'light' || value === 'dark' || value === 'auto')) {
      state.setPref('scheme', value);
    }
    if (name === 'send-mode' && (value === 'batch' || value === 'immediate')) {
      state.setPref('sendMode', value);
    }
    if (name === 'density' && (value === 'compact' || value === 'comfortable')) {
      state.setPref('density', value);
    }
  }
}

/** Register the custom element once. */
export function defineOverlay(tag: string = OVERLAY_TAG): void {
  const registry = globalThis.customElements;
  if (!registry || registry.get(tag)) return;
  registry.define(tag, AnnotOverlayElement);
}
