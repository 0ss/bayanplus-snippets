import { visitorId } from "./identity";
import { resolveSession } from "./sessions";
import type {
  ClickHouse,
  DeviceInfo,
  EventRow,
  ProjectStore,
  QueuedEvent,
} from "./types";

export type WorkerDeps = {
  ch: ClickHouse;
  projects: ProjectStore;
  parseUserAgent: (ua: string) => DeviceInfo;
};

export function createWorker(deps: WorkerDeps): (event: QueuedEvent) => Promise<void> {
  return async (event) => {
    try {
      await processEvent(event, deps);
    } catch (error) {
      console.error(error);
    }
  };
}

async function processEvent(event: QueuedEvent, deps: WorkerDeps): Promise<void> {
  if (!event.projectId || !event.name) return;

  const project = await deps.projects.get(event.projectId);
  if (!project) return;
  if (!event.host.includes(project.domain)) return;

  const parsed = deps.parseUserAgent(event.userAgent);
  if (parsed.bot) return;

  if (
    event.fingerprint !== undefined &&
    (await deps.projects.isFingerprintExcluded(event.projectId, event.fingerprint))
  ) {
    return;
  }

  const vid = visitorId(event.fingerprint, event.edge.ip, event.projectId);
  const userId = event.knownUserId ?? String(vid);

  if (event.knownUserId) {
    await stitchUserId(deps.ch, vid, event.knownUserId, event.projectId);
  }

  const sessionId = await resolveSession(deps.ch, {
    projectId: event.projectId,
    visitorId: vid,
    userId,
    page: event.page,
  });

  const row: EventRow = {
    projectId: event.projectId,
    eventId: Math.random().toString(36).slice(2, 16),
    visitorId: vid,
    userId,
    sessionId,
    name: event.name,
    page: event.page,
    referrer: event.referrer,
    country: event.edge.country,
    device: parsed.device,
    ip: event.edge.ip,
  };

  await deps.ch.insert("event", {
    project_id: row.projectId,
    event_id: row.eventId,
    visitor_id: row.visitorId,
    user_id: row.userId,
    session_id: row.sessionId,
    name: row.name,
    page: row.page,
    referrer: row.referrer,
    country_code: row.country,
    device: row.device,
    ip: row.ip,
    created_at: () => "now()",
  });
}

/** user.set: rewrite past rows. visitor_id stays. */
async function stitchUserId(
  ch: ClickHouse,
  vid: number,
  userId: string,
  projectId: string,
): Promise<void> {
  await ch.exec(
    `ALTER TABLE event UPDATE user_id = '${userId}'
WHERE visitor_id = ${vid} AND project_id = '${projectId}'`,
  );
  await ch.exec(
    `ALTER TABLE session UPDATE user_id = '${userId}'
WHERE visitor_id = ${vid} AND project_id = '${projectId}'`,
  );
}
