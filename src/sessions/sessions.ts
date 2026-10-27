import type { ProjectId, VisitorId } from "../domain/model";

export type SessionPolicy = {
  readonly inactivitySeconds: 1800;
};

export const sessionPolicy: SessionPolicy = { inactivitySeconds: 1800 };

export type Session = {
  sign: 1 | -1;
  projectId: ProjectId;
  visitorId: VisitorId;
  sessionId: number;
  userId: string;
  entryPage: string;
  exitPage: string;
  createdAt: Date;
  updatedAt: Date;
};

export type EventContext = {
  projectId: ProjectId;
  visitorId: VisitorId;
  userId: string;
  page: string;
  now: Date;
};

/**
 * The open row is whatever findActive returns. The 30 minute window lives in that query.
 * This service does not check the window a second time.
 * SAMPLE 1e6 can miss the open session and create a second one.
 */
export interface SessionRepository {
  findActive(
    visitorId: VisitorId,
    projectId: ProjectId,
    now: Date,
    policy: SessionPolicy,
  ): Promise<Session | null>;
  write(row: Session): Promise<void>;
}

/** New session ids from rand32(). */
export interface SessionIds {
  next(): number;
}

/**
 * CollapsingMergeTree has no in-place update.
 * Extending a session writes sign -1 (cancel) and sign +1 (new state).
 * createdAt stays, so both rows share one order key.
 *
 * Worker A reads X          Worker B reads X
 * A writes -1, then +1      B writes -1, then +1
 * Four rows, one key. Signs can sum to 0, and the session disappears on merge.
 *
 * Ten workers share this process. None of them owns the visitor. No lock.
 */
export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly ids: SessionIds,
    private readonly policy: SessionPolicy = sessionPolicy,
  ) {}

  async resolve(ctx: EventContext): Promise<number> {
    const open = await this.repository.findActive(
      ctx.visitorId,
      ctx.projectId,
      ctx.now,
      this.policy,
    );
    if (!open) {
      const sessionId = this.ids.next();
      await this.repository.write({
        sign: 1,
        projectId: ctx.projectId,
        visitorId: ctx.visitorId,
        sessionId,
        userId: ctx.userId,
        entryPage: ctx.page,
        exitPage: ctx.page,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
      return sessionId;
    }

    await this.repository.write({ ...open, sign: -1 });
    await this.repository.write({
      ...open,
      sign: 1,
      userId: ctx.userId,
      exitPage: ctx.page,
      updatedAt: ctx.now,
    });
    return open.sessionId;
  }
}
