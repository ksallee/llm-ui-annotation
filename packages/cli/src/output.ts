export interface Io {
  out(text: string): void;
  err(text: string): void;
}

export const consoleIo: Io = {
  out: (text) => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`),
  err: (text) => process.stderr.write(text.endsWith('\n') ? text : `${text}\n`),
};

export function json(io: Io, value: unknown): void {
  io.out(JSON.stringify(value, null, 2));
}

/** `#4 → review (changed)` */
export function statusLine(number: number, status: string, note?: string): string {
  return `#${number} → ${status}${note ? ` (${note})` : ''}`;
}
