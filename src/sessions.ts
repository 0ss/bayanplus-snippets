import type { ClickHouse, SessionRow } from "./types";

const IDLE_SECONDS = 1800;

export type SessionContext = {
  projectId: string;
  visitorId: number;
  userId: string;
  page: string;
};

/** Find an open session, or create one. Extending writes -1 then +1. */
export async function resolveSession(
  ch: ClickHouse,
  ctx: SessionContext,
): Promise<number> {
  const open = await findActive(ch, ctx.visitorId, ctx.projectId);

  if (!open) {
    const [row] = await ch.query<{ id: number }>("SELECT rand32() AS id");
    const sessionId = row.id;
    await ch.insert("session", {
      sign: 1,
      project_id: ctx.projectId,
      visitor_id: ctx.visitorId,
      session_id: sessionId,
      user_id: ctx.userId,
      entry_page: ctx.page,
      exit_page: ctx.page,
      created_at: () => "now()",
      updated_at: () => "now()",
    });
    return sessionId;
  }

  // Read-then-write allows two workers to race on the same visitor.
  await ch.insert("session", { ...toInsert(open), sign: -1 });
  await ch.insert("session", {
    ...toInsert(open),
    sign: 1,
    user_id: ctx.userId,
    exit_page: ctx.page,
    updated_at: () => "now()",
  });
  return open.sessionId;
}

async function findActive(
  ch: ClickHouse,
  visitorId: number,
  projectId: string,
): Promise<SessionRow | null> {
  const rows = await ch.query<{
    sign: 1 | -1;
    project_id: string;
    visitor_id: number;
    session_id: number;
    user_id: string;
    entry_page: string;
    exit_page: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT *
FROM session SAMPLE 1000000
WHERE visitor_id = ${visitorId}
  AND project_id = '${projectId}'
  AND updated_at > minus(now(), ${IDLE_SECONDS})
ORDER BY updated_at DESC
LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sign: row.sign,
    projectId: row.project_id,
    visitorId: row.visitor_id,
    sessionId: row.session_id,
    userId: row.user_id,
    entryPage: row.entry_page,
    exitPage: row.exit_page,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsert(row: SessionRow): Record<string, unknown> {
  return {
    sign: row.sign,
    project_id: row.projectId,
    visitor_id: row.visitorId,
    session_id: row.sessionId,
    user_id: row.userId,
    entry_page: row.entryPage,
    exit_page: row.exitPage,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
