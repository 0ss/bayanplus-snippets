import type {
  EventEnvelope,
  EventRepository,
  ProjectDirectory,
  Telemetry,
  UserAgentParser,
  ValidEvent,
  VisitorId,
} from "../domain/model";
import { validateEnvelope } from "../ingestion/accept";
import { IdentityResolver } from "../identity/identity";
import { SessionService, type EventContext } from "../sessions/sessions";
import { UserIdRewrite } from "../stitching/rewrite";

/**
 * Drops return without throwing, so the queue does not retry them.
 * A thrown insert is recorded and swallowed, so a retrier waiting on this worker sees success.
 * The ack already went out. rewrite() covers past rows; the new row uses the known user id now.
 */
export class EventWorker {
  constructor(
    private readonly projects: ProjectDirectory,
    private readonly agents: UserAgentParser,
    private readonly identity: IdentityResolver,
    private readonly sessions: SessionService,
    private readonly events: EventRepository,
    private readonly stitch: UserIdRewrite,
    private readonly telemetry: Telemetry,
  ) {}

  async run(envelope: EventEnvelope): Promise<void> {
    try {
      await this.process(envelope);
    } catch {
      this.telemetry.record("failed", { eventId: envelope.eventId });
    }
  }

  private async process(envelope: EventEnvelope): Promise<void> {
    const validation = await validateEnvelope(envelope, this.projects, this.agents);
    if (!validation.ok) {
      this.telemetry.record("dropped", { reason: validation.reason });
      return;
    }

    const event = validation.event;
    const visitorId = this.identity.resolve(event);
    const userId = event.knownUserId ?? String(visitorId);
    if (event.knownUserId) {
      await this.stitch.rewrite({
        projectId: event.projectId,
        visitorId,
        userId: event.knownUserId,
      });
    }

    const sessionId = await this.sessions.resolve(toContext(event, visitorId, userId));
    await this.events.insert({
      projectId: event.projectId,
      eventId: event.eventId,
      visitorId,
      userId,
      sessionId,
      name: event.name,
      page: event.page,
      referrer: event.referrer,
      country: event.country,
      device: event.device,
      ip: event.ip,
      receivedAt: event.receivedAt,
    });
    this.telemetry.record("inserted");
  }
}

function toContext(event: ValidEvent, visitorId: VisitorId, userId: string): EventContext {
  return {
    projectId: event.projectId,
    visitorId,
    userId,
    page: event.page,
    now: event.receivedAt,
  };
}
