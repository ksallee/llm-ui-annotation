import { routeOf, type OverlayOptions } from './options.js';
import { AnnotState, type AnnotStateOptions } from './state/annot-state.svelte.js';
import { AnnotClient } from './transport/client.js';

/** An `AnnotState` wired to the plugin's API for the current page. */
export function createState(options: OverlayOptions = {}): AnnotState {
  const doc = options.doc ?? globalThis.document;
  const url = doc?.defaultView?.location.href ?? '';
  const args: AnnotStateOptions = {
    doc,
    client: new AnnotClient(options.basePath),
    route: routeOf(url, options.routeKey),
    url,
  };
  if (options.sendMode) args.sendMode = options.sendMode;
  if (options.mode) args.mode = options.mode;
  return new AnnotState(args);
}
