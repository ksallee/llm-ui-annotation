export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_ILLEGAL = 2;
export const EXIT_TIMEOUT = 124;

export class CliError extends Error {
  readonly code: number;
  readonly details: string[];

  constructor(message: string, code = EXIT_FAIL, details: string[] = []) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = details;
  }
}
