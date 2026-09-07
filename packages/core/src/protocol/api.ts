/** Request and response bodies of the dev-server HTTP API. */

import type { Event } from './events.js';
import type { RouteFile } from './paths.js';
import type {
  Actor,
  Annotation,
  Attachment,
  Batch,
  MessageKind,
  ProtocolVersion,
  QuestionLevel,
  Resolution,
  Status,
  Target,
} from '../model/types.js';

export interface ErrorResponse {
  error: string;
  problems?: string[];
}

export interface HealthResponse {
  ok: true;
  protocolVersion: ProtocolVersion;
  dir: string;
}

export interface RouteSummary {
  route: string;
  slug: string;
  counts: Record<Status, number>;
}

export interface RoutesResponse {
  routes: string[];
  summaries?: RouteSummary[];
}

export type RouteResponse = RouteFile;

export interface PatchAnnotationRequest {
  comment?: string;
  /** New geometry for a drawing; appends a `drawing edited` message and returns `review` to `sent`. */
  target?: Target;
}

export interface CreateBatchRequest {
  route: string;
  annotationIds: string[];
  summary: string | null;
  questions?: QuestionLevel;
}

export interface TransitionRequest {
  to: Status;
  by: Actor;
  message?: { kind: MessageKind; text: string; role: Actor };
  resolution?: Resolution;
}

export interface EventsResponse {
  events: Event[];
}

export interface ScreenshotResponse {
  path: string;
}

export type AttachmentResponse = Attachment;

export interface DeleteResponse {
  ok: true;
}

export type CreateAnnotationRequest = Annotation;
export type AnnotationResponse = Annotation;
export type BatchResponse = Batch;
