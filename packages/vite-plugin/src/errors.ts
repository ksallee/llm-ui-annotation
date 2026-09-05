export class ApiError extends Error {
  readonly status: number;
  readonly problems: string[] | undefined;

  constructor(status: number, message: string, problems?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problems = problems;
  }
}

export const badRequest = (message: string, problems?: string[]): ApiError =>
  new ApiError(400, message, problems);

export const notFound = (message: string): ApiError => new ApiError(404, message);

export const conflict = (message: string, problems?: string[]): ApiError =>
  new ApiError(409, message, problems);
