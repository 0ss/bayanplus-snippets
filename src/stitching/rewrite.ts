import type { ProjectId, StatementRunner, VisitorId } from "../domain/model";

export type KnownUserLink = {
  projectId: ProjectId;
  visitorId: VisitorId;
  userId: string;
};

export type Profile = KnownUserLink & {
  sign: 1 | -1;
};

/** Collapsing profile rows. Write only when missing or the user id changed. */
export interface ProfileStore {
  find(visitorId: VisitorId, projectId: ProjectId): Promise<Profile | null>;
  write(row: Profile): Promise<void>;
}

/**
 * ALTER UPDATE user_id on past events and sessions. visitor_id is not rewritten.
 * Queries that count user_id change when the mutation finishes, with no new traffic.
 * Mutation runs in the background; reads can disagree until it finishes. Values are inlined.
 */
export class UserIdRewrite {
  constructor(
    private readonly statements: StatementRunner,
    private readonly profiles: ProfileStore,
  ) {}

  async rewrite(link: KnownUserLink): Promise<void> {
    const profile = await this.profiles.find(link.visitorId, link.projectId);
    if (profile && profile.userId === link.userId) return;

    if (!profile) {
      await this.profiles.write({ ...link, sign: 1 });
    }

    await this.statements.exec(alter("event", link));
    await this.statements.exec(alter("session", link));

    if (profile) {
      await this.profiles.write({ ...profile, sign: -1 });
      await this.profiles.write({ ...link, sign: 1 });
    }
  }
}

function alter(table: "event" | "session", link: KnownUserLink): string {
  return `ALTER TABLE ${table} UPDATE user_id = '${link.userId}'
WHERE visitor_id = ${link.visitorId}
  AND project_id = '${link.projectId}'`;
}
