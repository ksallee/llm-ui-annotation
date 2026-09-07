import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from './errors.js';

const AGENT = /^[A-Za-z0-9._-]{1,64}$/;

/** True when the name is safe to put in a filename. */
export const isAgentName = (agent: string): boolean => AGENT.test(agent) && !agent.startsWith('.');

export function cursorPath(dir: string, agent: string): string {
  if (!isAgentName(agent)) throw new CliError(`--agent: unusable name ${JSON.stringify(agent)}`);
  return join(dir, `.cursor-${agent}`);
}

export async function readCursor(dir: string, agent: string): Promise<number> {
  try {
    const text = await readFile(cursorPath(dir, agent), 'utf8');
    const seq = Number.parseInt(text.trim(), 10);
    return Number.isFinite(seq) && seq > 0 ? seq : 0;
  } catch {
    return 0;
  }
}

export async function writeCursor(dir: string, agent: string, seq: number): Promise<void> {
  await writeFile(cursorPath(dir, agent), `${seq}\n`, 'utf8');
}
