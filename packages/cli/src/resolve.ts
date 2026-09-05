import type { Annotation } from '@llm-ui-annotation/core';
import { CliError } from './errors.js';

function label(a: Annotation): string {
  return `#${a.number} ${a.route} ${a.id}`;
}

/** Resolve one `<id>`: a full id, a unique id prefix, or `#<number>`. */
export function resolveOne(
  all: readonly Annotation[],
  token: string,
  route?: string,
): Annotation {
  const scoped = route === undefined ? all : all.filter((a) => a.route === route);
  const numeric = /^#?\d+$/.test(token);

  if (numeric) {
    const number = Number.parseInt(token.replace('#', ''), 10);
    const hits = scoped.filter((a) => a.number === number);
    if (hits.length === 1 && hits[0]) return hits[0];
    if (hits.length === 0) throw new CliError(`no annotation #${number}${route ? ` on ${route}` : ''}`);
    throw new CliError(`#${number} is ambiguous, pass --route`, 1, hits.map(label));
  }

  const needle = token.toUpperCase();
  const exact = scoped.find((a) => a.id === needle);
  if (exact) return exact;

  const hits = scoped.filter((a) => a.id.startsWith(needle));
  if (hits.length === 1 && hits[0]) return hits[0];
  if (hits.length === 0) throw new CliError(`no annotation matching ${token}`);
  throw new CliError(`${token} matches ${hits.length} annotations`, 1, hits.map(label));
}

export function resolveMany(
  all: readonly Annotation[],
  tokens: readonly string[],
  route?: string,
): Annotation[] {
  if (tokens.length === 0) throw new CliError('missing <id>');
  const seen = new Set<string>();
  const out: Annotation[] = [];
  for (const token of tokens) {
    const a = resolveOne(all, token, route);
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}
