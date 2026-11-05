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
  TextTarget,
  Viewport,
} from '../model/types.js';

export interface ErrorResponse {
  error: string;
  problems?: string[];
}

export interface HealthResponse {
  ok: true;
  protocolVersion: ProtocolVersion;
  dir: string;
  /** The server can write a text replacement into the page's source (`POST /replace`). */
  replace?: boolean;
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

/** A text replacement for the source behind `route`; the server records it as a `replace` annotation. */
export interface ReplaceRequest {
  route: string;
  url: string;
  target: TextTarget;
  replacement: string;
  viewport: Viewport;
}

export interface EventsResponse {
  events: Event[];
}

export type AttachmentResponse = Attachment;

export interface DeleteResponse {
  ok: true;
}

export type CreateAnnotationRequest = Annotation;
export type AnnotationResponse = Annotation;
export type BatchResponse = Batch;
export type ReplaceResponse = Annotation;
