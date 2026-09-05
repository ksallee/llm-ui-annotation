const TEMPLATE = `
  <style>
    :host { display: block; }
    .box { border: 1px dashed currentColor; border-radius: 10px; padding: 16px; }
    button { font: inherit; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  </style>
  <div class="box">
    <strong>Inside an open shadow root</strong>
    <p>Selectors have to cross it with <code>&gt;&gt;&gt;</code>.</p>
    <button data-testid="shadow-cta" type="button">Deep button</button>
  </div>
`;

/** A host element with an open shadow root, so `describeSelector` has to cross one. */
export class ShadowCard extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
  }
}

export function defineShadowCard(): void {
  if (!customElements.get('shadow-card')) customElements.define('shadow-card', ShadowCard);
}
