import {
  asEdgeIp,
  asFingerprint,
  asProjectId,
  type Ack,
  type Clock,
  type DropReason,
  type EventEnvelope,
  type EventId,
  type IncomingHit,
  type ProjectDirectory,
  type Telemetry,
  type UserAgentParser,
  type ValidEvent,
} from "../domain/model";
import type { EnqueueRetrier } from "./queue";

export type Validation =
  | { ok: true; event: ValidEvent }
  | { ok: false; reason: DropReason };

/**
 * Runs on the worker, after the ack. A drop returns without throwing so the queue treats it as done.
 * Domain uses host.includes(domain): a host that contains the string passes.
 */
export async function validateEnvelope(
  envelope: EventEnvelope,
  projects: ProjectDirectory,
  agents: UserAgentParser,
): Promise<Validation> {
  if (!envelope.projectId) return { ok: false, reason: "missing-project" };
  if (!envelope.name) return { ok: false, reason: "missing-name" };
  const project = await projects.lookup(envelope.projectId);
  if (!project) return { ok: false, reason: "unknown-project" };
  if (!envelope.host.includes(project.domain)) return { ok: false, reason: "domain" };
  const parsed = agents.parse(envelope.userAgent);
  if (parsed.bot) return { ok: false, reason: "bot" };
  if (
    envelope.fingerprint &&
    (await projects.fingerprintExcluded(envelope.projectId, envelope.fingerprint))
  ) {
    return { ok: false, reason: "excluded" };
  }
  return {
    ok: true,
    event: {
      ...envelope,
      projectId: envelope.projectId,
      name: envelope.name,
      device: parsed.device,
    },
  };
}

export class IngestionService {
  constructor(
    private readonly retry: EnqueueRetrier,
    private readonly clock: Clock,
    private readonly telemetry: Telemetry,
  ) {}

  /** Envelope is in memory before this returns. Identity, session, and insert have not run. */
  async accept(hit: IncomingHit): Promise<Ack> {
    await this.retry.submit(stamp(hit, this.clock.now()));
    this.telemetry.record("ack");
    return { httpStatus: 200, durability: "memory", meaning: "received" };
  }
}

export async function handleCollect(
  hit: IncomingHit,
  respond: (ack: Ack) => void,
  ingestion: IngestionService,
): Promise<void> {
  respond(await ingestion.accept(hit));
}

function stamp(hit: IncomingHit, now: Date): EventEnvelope {
  return {
    eventId: mintEventId() as EventId,
    receivedAt: now,
    projectId: hit.projectId ? asProjectId(hit.projectId) : undefined,
    name: hit.name,
    page: hit.page,
    referrer: hit.referrer,
    fingerprint: hit.fingerprint === undefined ? undefined : asFingerprint(hit.fingerprint),
    knownUserId: hit.knownUserId,
    host: hit.host,
    userAgent: hit.userAgent,
    ip: asEdgeIp(hit.edge.ip),
    country: hit.edge.country,
  };
}

/** Fresh id on every accept. */
function mintEventId(): string {
  return Math.random().toString(36).slice(2, 16);
}
