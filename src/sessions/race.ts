import { asProjectId, asVisitorId } from "../domain/model";
import { SessionService, type EventContext, type Session, type SessionRepository } from "./sessions";

/**
 * Two workers can race here because session ownership isn't serialized.
 * The store does not lock. That is the production shape, in one process.
 */
export async function reproduceSessionRace(): Promise<{ plus: number; signSum: number }> {
  const open = fixture();
  const store = unlockedStore(open);
  const service = new SessionService(store, { next: () => 0 });
  const left = context("a");
  const right = context("b");

  await Promise.all([service.resolve(left), service.resolve(right)]);

  const plus = store.rows.filter((row) => row.sign === 1).length;
  const signSum = store.rows.reduce((sum, row) => sum + row.sign, 0);
  return { plus, signSum };
}

/** Two +1 rows and a sign sum of 0: the session collapses away on merge. */
export async function demonstrateSessionRace(): Promise<void> {
  const { plus, signSum } = await reproduceSessionRace();
  if (plus !== 2 || signSum !== 0) {
    throw new Error(`expected two +1 rows and sign sum 0, got plus=${plus} sum=${signSum}`);
  }
}

function fixture(): Session {
  const now = new Date(0);
  return {
    sign: 1,
    projectId: asProjectId("p"),
    visitorId: asVisitorId(1),
    sessionId: 7,
    userId: "1",
    entryPage: "/pricing",
    exitPage: "/pricing",
    createdAt: now,
    updatedAt: now,
  };
}

function context(page: string): EventContext {
  return {
    projectId: asProjectId("p"),
    visitorId: asVisitorId(1),
    userId: "1",
    page: `/${page}`,
    now: new Date(10 * 60 * 1000),
  };
}

function unlockedStore(open: Session): SessionRepository & { rows: Session[] } {
  const rows: Session[] = [];
  let readers = 0;
  let release: () => void = () => {};
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    rows,
    async findActive() {
      readers += 1;
      if (readers >= 2) release();
      await bothRead;
      return open;
    },
    async write(row) {
      rows.push(row);
    },
  };
}
