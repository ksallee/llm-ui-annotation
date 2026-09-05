import { PROTOCOL_VERSION } from '@llm-ui-annotation/core';
import type { ResolvedOptions } from './options.js';

export const AUTO_MODULE = '@llm-ui-annotation/svelte/auto';
export const VIRTUAL_ID = 'virtual:annot-auto';
export const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
export const GLOBAL_OPTIONS = '__ANNOT_OPTIONS__';

/** URL of the injected script for a Vite `base`. */
export function scriptSrc(base: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}@id/__x00__${VIRTUAL_ID}`;
}

export interface OverlayOptions {
  basePath: string;
  protocolVersion: number;
  accent?: string;
  scheme: string;
}

export function overlayOptions(options: ResolvedOptions): OverlayOptions {
  return {
    basePath: options.basePath,
    protocolVersion: PROTOCOL_VERSION,
    ...(options.accent === null ? {} : { accent: options.accent }),
    scheme: options.scheme,
  };
}

/**
 * Source of the virtual module the injected script loads.
 *
 * @param options plugin options handed to the overlay.
 * @param available whether `@llm-ui-annotation/svelte/auto` resolves.
 */
export function autoModuleSource(options: ResolvedOptions, available: boolean): string {
  const json = JSON.stringify(overlayOptions(options));
  const load = available
    ? `import(${JSON.stringify(AUTO_MODULE)}).catch((error) => {\n  console.error('[annot] failed to load the overlay', error);\n});`
    : `console.warn('[annot] ${AUTO_MODULE} is not installed; the overlay was not mounted.');`;
  return `globalThis.${GLOBAL_OPTIONS} = ${json};\n${load}\n`;
}
