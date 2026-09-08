// Where an element was written, when the dev build says so.

/** A place in the project's source, as a framework's dev build records it. */
export interface SourceLoc {
  /** Path as the tool that built the page reports it, absolute or project-relative. */
  file: string;
  line?: number;
  column?: number;
}

interface SvelteMeta {
  loc?: { file?: unknown; line?: unknown; column?: unknown };
}

interface ReactSource {
  fileName?: unknown;
  lineNumber?: unknown;
  columnNumber?: unknown;
}

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function place(file: unknown, line: unknown, column: unknown): SourceLoc | undefined {
  if (typeof file !== 'string' || file === '') return undefined;
  const at = num(line);
  const col = num(column);
  return { file, ...(at === undefined ? {} : { line: at }), ...(col === undefined ? {} : { column: col }) };
}

/** React keeps its fiber under a per-render key, so the property has to be found by prefix. */
function reactSource(el: Element): SourceLoc | undefined {
  const key = Object.keys(el).find((name) => name.startsWith('__reactFiber$'));
  if (key === undefined) return undefined;
  const fiber = (el as unknown as Record<string, { _debugSource?: ReactSource }>)[key];
  const source = fiber?._debugSource;
  return source ? place(source.fileName, source.lineNumber, source.columnNumber) : undefined;
}

/**
 * The file and line the element came from, when a dev build attached it: Svelte's `__svelte_meta`,
 * React's fiber. Production builds carry none of this, and neither does a hand-written page.
 */
export function sourceOf(el: Element): SourceLoc | undefined {
  const loc = (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta?.loc;
  return loc ? place(loc.file, loc.line, loc.column) : reactSource(el);
}
