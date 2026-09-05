import {
  DEFAULT_BASE_PATH,
  slug,
  type Annotation,
  type Batch,
  type CreateBatchRequest,
  type ErrorResponse,
  type Event,
  type HealthResponse,
  type RouteFile,
  type RoutesResponse,
  type TransitionRequest,
} from '@llm-ui-annotation/core';

export class AnnotHttpError extends Error {
  readonly status: number;
  readonly problems: string[];

  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.name = 'AnnotHttpError';
    this.status = status;
    this.problems = problems;
  }
}

export type Fetch = typeof globalThis.fetch;

/** Thin typed wrapper over the plugin's `/__annot` API. */
export class AnnotClient {
  readonly basePath: string;
  #fetch: Fetch;

  constructor(basePath: string = DEFAULT_BASE_PATH, fetchImpl?: Fetch) {
    this.basePath = basePath.replace(/\/$/, '');
    this.#fetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  }

  async #json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.#fetch(`${this.basePath}${path}`, {
      headers: init?.body && !(init.body instanceof Blob) ? { 'content-type': 'application/json' } : {},
      ...init,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ErrorResponse | null;
      throw new AnnotHttpError(response.status, body?.error ?? response.statusText, body?.problems ?? []);
    }
    return (await response.json()) as T;
  }

  async health(): Promise<HealthResponse | null> {
    try {
      return await this.#json<HealthResponse>('/health');
    } catch {
      return null;
    }
  }

  route(route: string): Promise<RouteFile> {
    return this.#json<RouteFile>(`/routes/${slug(route)}`);
  }

  routes(): Promise<RoutesResponse> {
    return this.#json<RoutesResponse>('/routes');
  }

  create(annotation: Annotation): Promise<Annotation> {
    return this.#json<Annotation>('/annotations', {
      method: 'POST',
      body: JSON.stringify(annotation),
    });
  }

  patch(id: string, comment: string): Promise<Annotation> {
    return this.#json<Annotation>(`/annotations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ comment }),
    });
  }

  async remove(id: string): Promise<void> {
    await this.#json<{ ok: true }>(`/annotations/${id}`, { method: 'DELETE' });
  }

  createBatch(request: CreateBatchRequest): Promise<Batch> {
    return this.#json<Batch>('/batches', { method: 'POST', body: JSON.stringify(request) });
  }

  transition(id: string, request: TransitionRequest): Promise<Annotation> {
    return this.#json<Annotation>(`/annotations/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  events(since: number): Promise<{ events: Event[] }> {
    return this.#json<{ events: Event[] }>(`/events?since=${since}`);
  }

  screenshot(id: string, png: Blob): Promise<{ path: string }> {
    return this.#json<{ path: string }>(`/screenshots/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: png,
    });
  }
}
