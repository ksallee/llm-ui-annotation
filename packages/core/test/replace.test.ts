import { describe, expect, it } from 'vitest';
import { applyReplacement } from '../src/index.js';

const SOURCE = `# The Shape of a Reading Room

## Why one document

A reader that holds a single file can afford to be quiet. The file on
disk is the source of truth; the page is a view of it.

- **Text** is the default mode: the selection is anchored by quote and offsets.
- **Element** outlines whatever you point at.

> The agent replies with a summary, not a diff. You read the summary in the
> panel, look at the paragraph, and approve.

See [the docs](https://example.com/docs) for snake_case names.
`;

const target = (quote: string, prefix: string, suffix: string) => ({ quote, prefix, suffix });

describe('applyReplacement', () => {
  it('replaces the anchored span and nothing else', () => {
    const result = applyReplacement(SOURCE, target('a single file', 'A reader that holds ', ' can afford to be q'), 'one file');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(SOURCE.replace('a single file', 'one file'));
    expect(SOURCE.slice(result.start, result.end)).toBe('a single file');
  });

  it('matches a quote that wraps across a line break', () => {
    const result = applyReplacement(SOURCE, target('file on disk', 'afford to be quiet. The ', ' is the source of truth'), 'file');
    expect(result.ok && result.text).toContain('quiet. The file is the source of truth');
  });

  it('reads context through inline markup, list markers and blockquote markers', () => {
    const inList = applyReplacement(
      SOURCE,
      target('default mode', 'Text is the ', ': the selection is anchored'),
      'first mode',
    );
    expect(inList.ok && inList.text).toContain('- **Text** is the first mode: the selection');

    const inQuote = applyReplacement(
      SOURCE,
      target('look at the paragraph', 'You read the summary in the panel, ', ', and approve.'),
      'reread the paragraph',
    );
    expect(inQuote.ok && inQuote.text).toContain('> panel, reread the paragraph, and approve.');
  });

  it('reads context through a link target and keeps literal underscores', () => {
    const result = applyReplacement(SOURCE, target('snake_case', 'See the docs for ', ' names.'), 'kebab-case');
    expect(result.ok && result.text).toContain('[the docs](https://example.com/docs) for kebab-case names.');
  });

  it('refuses when the file has drifted', () => {
    expect(applyReplacement(SOURCE, target('a single file', 'A writer that holds ', ' can afford'), 'x')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('refuses a quote that occurs more than once with the same context', () => {
    expect(applyReplacement('one two one two', target('one', '', ''), 'x')).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('refuses a span that crosses formatting in the source', () => {
    expect(
      applyReplacement(SOURCE, target('Element outlines', 'by quote and offsets. ', ' whatever you point'), 'x'),
    ).toEqual({ ok: false, reason: 'formatted' });
  });

  it('refuses an empty quote', () => {
    expect(applyReplacement(SOURCE, target('', 'A', 'B'), 'x')).toEqual({ ok: false, reason: 'not-found' });
  });
});
