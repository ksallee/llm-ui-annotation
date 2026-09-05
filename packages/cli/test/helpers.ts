import { run } from '../src/run.js';
import type { Io } from '../src/output.js';

export interface Result {
  code: number;
  out: string;
  err: string;
}

/** Run `annot` in process against `dir`. */
export async function annot(dir: string, ...argv: string[]): Promise<Result> {
  const chunks: string[] = [];
  const errors: string[] = [];
  const io: Io = {
    out: (t) => void chunks.push(t.endsWith('\n') ? t : `${t}\n`),
    err: (t) => void errors.push(t.endsWith('\n') ? t : `${t}\n`),
  };
  const code = await run([...argv, '--dir', dir], io);
  return { code, out: chunks.join(''), err: errors.join('') };
}
