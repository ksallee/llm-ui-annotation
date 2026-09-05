import { PROTOCOL_VERSION } from '@llm-ui-annotation/core';
import { parseArgs, flagBool, type Args } from './args.js';
import { openContext, type Context } from './context.js';
import { CliError, EXIT_FAIL, EXIT_OK } from './errors.js';
import { HELP } from './help.js';
import { consoleIo, type Io } from './output.js';
import { init } from './commands/init.js';
import { ack, ask, decline, done, reply } from './commands/mutate.js';
import { doctor, pending, routes, screenshot, show } from './commands/read.js';
import { watch } from './commands/watch.js';

export const VERSION = '0.1.0';

type Command = (ctx: Context, args: Args, io: Io) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  watch,
  pending,
  show,
  ack,
  ask,
  reply,
  done,
  decline,
  screenshot,
  routes,
  doctor,
};

/** Run one `annot` invocation and return its exit code. */
export async function run(argv: readonly string[], io: Io = consoleIo): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    return fail(io, err);
  }

  if (flagBool(args, 'version')) {
    io.out(`annot ${VERSION} (protocol ${PROTOCOL_VERSION})`);
    return EXIT_OK;
  }
  if (args.command === '' || args.command === 'help' || flagBool(args, 'help')) {
    io.out(HELP);
    return args.command === '' && !flagBool(args, 'help') ? EXIT_FAIL : EXIT_OK;
  }

  try {
    if (args.command === 'init') return await init(args, io);
    const command = COMMANDS[args.command];
    if (!command) {
      io.err(`annot: unknown command "${args.command}"`);
      io.err(HELP);
      return EXIT_FAIL;
    }
    const ctx = await openContext(args, (line) => io.err(line));
    return await command(ctx, args, io);
  } catch (err) {
    return fail(io, err);
  }
}

function fail(io: Io, err: unknown): number {
  if (err instanceof CliError) {
    io.err(`annot: ${err.message}`);
    for (const detail of err.details) io.err(`  ${detail}`);
    return err.code;
  }
  io.err(`annot: ${err instanceof Error ? err.message : String(err)}`);
  return EXIT_FAIL;
}
