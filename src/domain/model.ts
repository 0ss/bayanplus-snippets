declare const brand: unique symbol;

export type ProjectId = string & { readonly [brand]: "ProjectId" };
export type VisitorId = number & { readonly [brand]: "VisitorId" };
export type BrowserFingerprint = number & { readonly [brand]: "BrowserFingerprint" };
export type EdgeIp = string & { readonly [brand]: "EdgeIp" };

export const asProjectId = (value: string): ProjectId => value as ProjectId;
export const asVisitorId = (value: number): VisitorId => value as VisitorId;
export const asFingerprint = (value: number): BrowserFingerprint => value as BrowserFingerprint;
export const asEdgeIp = (value: string): EdgeIp => value as EdgeIp;

/** Headers the edge attached. Stored, not proven. */
export type EdgeContext = {
  ip: EdgeIp;
  country: string;
};

/** What the page sent. No client event id, event time, or device. */
export type IncomingHit = {
  projectId?: string;
  name?: string;
  page: string;
  referrer: string;
  fingerprint?: number;
  knownUserId?: string;
  host: string;
  userAgent: string;
  edge: EdgeContext;
};

export type EventId = string & { readonly [brand]: "EventId" };

/**
 * In memory after accept, not a row. receivedAt is the accept clock.
 * A backed-up queue can date the ClickHouse row later than this stamp.
 */
export type EventEnvelope = {
  eventId: EventId;
  receivedAt: Date;
  projectId?: ProjectId;
  name?: string;
  page: string;
  referrer: string;
  fingerprint?: BrowserFingerprint;
  knownUserId?: string;
  host: string;
  userAgent: string;
  ip: EdgeIp;
  country: string;
};

/** Drop checks passed. device comes from the user agent, not the page. */
export type ValidEvent = EventEnvelope & {
  projectId: ProjectId;
  name: string;
  device: string;
};

export type DropReason =
  | "missing-project"
  | "missing-name"
  | "unknown-project"
  | "domain"
  | "bot"
  | "excluded";

/**
 * Historical behavior: ACK happened before durable storage.
 * `received` means the envelope is in process memory, not that ClickHouse has a row.
 */
export type Ack = {
  readonly httpStatus: 200;
  readonly durability: "memory";
  readonly meaning: "received";
};

export type StoredEvent = {
  projectId: ProjectId;
  eventId: EventId;
  visitorId: VisitorId;
  userId: string;
  sessionId: number;
  name: string;
  page: string;
  referrer: string;
  country: string;
  device: string;
  ip: EdgeIp;
  receivedAt: Date;
};

export interface Clock {
  now(): Date;
}

export interface Telemetry {
  record(name: "ack" | "dropped" | "inserted" | "failed", fields?: Record<string, string>): void;
}

export interface ProjectRecord {
  domain: string;
}

/** Control plane: projects, members, and the fingerprint blacklist. */
export interface ProjectDirectory {
  lookup(id: ProjectId): Promise<ProjectRecord | null>;
  fingerprintExcluded(id: ProjectId, fingerprint: BrowserFingerprint): Promise<boolean>;
}

/** One parse of the user agent. A bot is dropped. device is the column we store. */
export interface UserAgentParser {
  parse(userAgent: string): { bot: boolean; device: string };
}

/** One row per call. No batching. */
export interface EventRepository {
  insert(row: StoredEvent): Promise<void>;
}

export interface StatementRunner {
  exec(sql: string): Promise<void>;
}
