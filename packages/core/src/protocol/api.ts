import type { Event } from './events.js';
import type { RouteFile } from './paths.js';
import type {
  Actor,
  Annotation,
  Batch,
  MessageKind,
  ProtocolVersion,
  Resolution,
  Status,
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
}

export interface CreateBatchRequest {
  route: string;
  annotationIds: string[];
  summary: string | null;
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

export interface DeleteResponse {
  ok: true;
}

export type CreateAnnotationRequest = Annotation;
export type AnnotationResponse = Annotation;
export type BatchResponse = Batch;
