/** What the browser tracker sends. */
export type BrowserEvent = {
  projectId?: string;
  name?: string;
  page: string;
  referrer: string;
  fingerprint?: number;
  knownUserId?: string;
  host: string;
  userAgent: string;
};

/** Geo and IP attached by the edge. */
export type EdgeContext = {
  ip: string;
  country: string;
};

/** Envelope sitting in the in-memory queue after collect. */
export type QueuedEvent = BrowserEvent & {
  edge: EdgeContext;
};

/** Row written to the event table. */
export type EventRow = {
  projectId: string;
  eventId: string;
  visitorId: number;
  userId: string;
  sessionId: number;
  name: string;
  page: string;
  referrer: string;
  country: string;
  device: string;
  ip: string;
};

/** Collapsing session row. */
export type SessionRow = {
  sign: 1 | -1;
  projectId: string;
  visitorId: number;
  sessionId: number;
  userId: string;
  entryPage: string;
  exitPage: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  domain: string;
};

/** Minimal ClickHouse surface real code needs. */
export type ClickHouse = {
  query<T extends Record<string, unknown>>(sql: string): Promise<T[]>;
  insert(table: string, row: Record<string, unknown>): Promise<void>;
  exec(sql: string): Promise<void>;
};

export type ProjectStore = {
  get(projectId: string): Promise<Project | null>;
  isFingerprintExcluded(projectId: string, fingerprint: number): Promise<boolean>;
};

export type DeviceInfo = {
  bot: boolean;
  device: string;
};
