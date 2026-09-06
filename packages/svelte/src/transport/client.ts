import {
  DEFAULT_BASE_PATH,
  slug,
  type Annotation,
  type Attachment,
  type Batch,
  type CreateBatchRequest,
  type ErrorResponse,
  type Event,
  type HealthResponse,
  type RouteFile,
  type RoutesResponse,
  type Target,
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

  patchTarget(id: string, target: Target): Promise<Annotation> {
    return this.#json<Annotation>(`/annotations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ target }),
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

  /** An object URL for a stored screenshot, or null when the server has none. */
  async screenshotUrl(id: string): Promise<string | null> {
    try {
      const response = await this.#fetch(`${this.basePath}/screenshots/${id}`);
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch {
      return null;
    }
  }

  screenshot(id: string, png: Blob): Promise<{ path: string }> {
    return this.#json<{ path: string }>(`/screenshots/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: png,
    });
  }

  /** Post one file to an annotation that already exists server-side. */
  attach(id: string, file: Blob, name: string): Promise<Attachment> {
    // The server sniffs the bytes and refuses the CORS-simple types, so the file's own MIME never
    // goes on the wire: a .txt would arrive as `text/plain` and come back 415.
    return this.#json<Attachment>(
      `/annotations/${id}/attachments?name=${encodeURIComponent(name)}`,
      { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file },
    );
  }

  async detach(id: string, attachmentId: string): Promise<void> {
    await this.#json<{ ok: true }>(`/annotations/${id}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  }

  /** Where the browser reads an attachment back: an `<img>` source, or a tab to open. */
  attachmentUrl(id: string, attachmentId: string): string {
    return `${this.basePath}/attachments/${id}/${attachmentId}`;
  }
}
