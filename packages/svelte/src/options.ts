import type { Mode } from '@llm-ui-annotation/core';
import type { AnnotState } from './state/annot-state.svelte.js';
import type { Density, Scheme } from '@llm-ui-annotation/core/theme';

export type SchemeOption = Scheme;
export type { Density };

/**
 * What happens when a note is written: `manual` keeps it as a draft to send by hand, `review` sends
 * it at once and waits for the agent's work to be reviewed, `auto` sends it and approves the result.
 */
export type SendMode = 'manual' | 'review' | 'auto';

/** The names the element attribute used before there were three. */
const SEND_ALIASES: Record<string, SendMode> = { batch: 'manual', immediate: 'review' };

export const sendModeOf = (value: string): SendMode | null =>
  SEND_ALIASES[value] ?? (SEND_MODES.has(value) ? (value as SendMode) : null);
export type DetailLevel = 'compact' | 'standard' | 'detailed';
export type MarkerVisibility = 'all' | 'dots' | 'none';
export type Corner = 'br' | 'bl' | 'tr' | 'tl';

/** The subset of `import.meta.hot` the overlay uses. */
export interface HotLike {
  on(event: string, handler: (payload: unknown) => void): void;
  off?(event: string, handler: (payload: unknown) => void): void;
}

export interface OverlayOptions {
  accent?: string;
  scheme?: SchemeOption;
  density?: Density;
  /** Overrides `location.pathname`. */
  routeKey?: string;
  sendMode?: SendMode;
  basePath?: string;
  /** Mode to start in. */
  mode?: Mode;
  hot?: HotLike | null;
  doc?: Document;
  /** Where the custom element is appended; defaults to `document.body`. */
  target?: HTMLElement;
}

export interface AnnotatorProps {
  /** Reuse an existing state; when omitted the component owns one and connects it. */
  state?: AnnotState;
  options?: OverlayOptions;
  version?: string;
  accent?: string;
  scheme?: SchemeOption;
  sendMode?: SendMode;
  routeKey?: string;
  basePath?: string;
  mode?: Mode;
}

export const ATTRIBUTES = [
  'accent',
  'scheme',
  'density',
  'route-key',
  'send-mode',
  'base-path',
  'mode',
] as const;

const SCHEMES = new Set(['light', 'dark', 'auto']);
const SEND_MODES = new Set<string>(['manual', 'review', 'auto']);
const MODES = new Set(['element', 'text', 'page']);

/** Read `<annot-overlay>` attributes into options. Unknown values are dropped. */
export function optionsFromAttributes(el: Element): OverlayOptions {
  const out: OverlayOptions = {};
  const accent = el.getAttribute('accent');
  if (accent) out.accent = accent;
  const scheme = el.getAttribute('scheme');
  if (scheme && SCHEMES.has(scheme)) out.scheme = scheme as SchemeOption;
  const density = el.getAttribute('density');
  if (density === 'compact' || density === 'comfortable') out.density = density;
  const routeKey = el.getAttribute('route-key');
  if (routeKey) out.routeKey = routeKey;
  const sendMode = el.getAttribute('send-mode');
  const send = sendMode === null ? null : sendModeOf(sendMode);
  if (send) out.sendMode = send;
  const basePath = el.getAttribute('base-path');
  if (basePath) out.basePath = basePath;
  const mode = el.getAttribute('mode');
  if (mode && MODES.has(mode)) out.mode = mode as Mode;
  return out;
}

/** The route key for a URL: the pathname unless the host overrode it. */
export function routeOf(url: string, override?: string): string {
  if (override) return override;
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}
