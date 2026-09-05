import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { READER, REPO } from './build.js';

export interface DevServer {
  url: string;
  stop(): void;
}

const freePort = (start: number): Promise<number> =>
  new Promise((done, fail) => {
    const probe = (port: number): void => {
      if (port > start + 80) {
        fail(new Error('no free port'));
        return;
      }
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.on('connect', () => {
        socket.destroy();
        probe(port + 1);
      });
      socket.on('error', () => done(port));
    };
    probe(start);
  });

async function waitForHttp(url: string, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
}

/** The reader's own dev server, on `doc`, with storage next to it. */
export async function startReader(doc: string): Promise<DevServer> {
  const port = await freePort(5410);
  const env: NodeJS.ProcessEnv = { ...process.env, DOC: doc };
  delete env['ANNOT_DIR'];
  const proc: ChildProcess = spawn(
    'pnpm',
    ['--dir', READER, 'exec', 'vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: REPO, stdio: 'ignore', env },
  );
  const url = `http://127.0.0.1:${port}/`;
  if (!(await waitForHttp(url, 60))) {
    proc.kill('SIGTERM');
    throw new Error(`reader dev server did not start on ${url}`);
  }
  return { url, stop: () => void proc.kill('SIGTERM') };
}
