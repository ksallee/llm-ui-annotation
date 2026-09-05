import { describe, expect, it } from 'vitest';
import { flagBool, flagNumber, flagString, parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('splits the command, its positionals and its flags', () => {
    const args = parseArgs(['done', 'A1', 'B2', '--summary', 'made it taller', '--json']);
    expect(args.command).toBe('done');
    expect(args.positionals).toEqual(['A1', 'B2']);
    expect(flagString(args, 'summary')).toBe('made it taller');
    expect(flagBool(args, 'json')).toBe(true);
  });

  it('takes --flag=value', () => {
    const args = parseArgs(['pending', '--level=compact', '--route=/a/b']);
    expect(flagString(args, 'level')).toBe('compact');
    expect(flagString(args, 'route')).toBe('/a/b');
  });

  it('takes -h and -v', () => {
    expect(flagBool(parseArgs(['-h']), 'help')).toBe(true);
    expect(flagBool(parseArgs(['-v']), 'version')).toBe(true);
  });

  it('stops flag parsing at --', () => {
    const args = parseArgs(['ask', 'A1', '--', '--why not?']);
    expect(args.positionals).toEqual(['A1', '--why not?']);
  });

  it('rejects a value flag with no value and a number flag with no number', () => {
    expect(() => parseArgs(['watch', '--timeout'])).toThrow('--timeout needs a value');
    expect(() => flagNumber(parseArgs(['watch', '--timeout', 'soon']), 'timeout')).toThrow();
  });

  it('reads numbers and missing flags', () => {
    const args = parseArgs(['watch', '--since', '12']);
    expect(flagNumber(args, 'since')).toBe(12);
    expect(flagString(args, 'route')).toBeUndefined();
    expect(flagBool(args, 'json')).toBe(false);
  });
});
