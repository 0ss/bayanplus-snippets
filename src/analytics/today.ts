import { AGGREGATE, COLUMN, type AnalyticsQuery } from "./compile";

/**
 * Values stay in params. tenant is the authenticated project.
 * Does not read the caller projectId on the question type.
 */
export type CompiledQuery = {
  sql: string;
  params: Record<string, string>;
};

export function compileToday(
  query: Omit<AnalyticsQuery, "projectId">,
  tenant: string,
): CompiledQuery {
  if (!tenant) throw new Error("tenant comes from auth, not from the question");

  const params: Record<string, string> = {
    tenant,
    from: query.timeRange.from,
    to: query.timeRange.to,
  };
  const filters = query.filters.map((filter) => {
    params[filter.dimension] = filter.prefix;
    return `${COLUMN[filter.dimension]} LIKE concat({${filter.dimension}:String}, '%')`;
  });
  const dims = query.dimensions.map((dimension) => COLUMN[dimension]);
  const value = `${AGGREGATE[query.metric]} AS value`;
  const select = dims.length ? `${value}, ${dims.join(", ")}` : value;
  const eventWhere = [
    "e.project_id = {tenant:String}",
    "e.created_at >= {from:DateTime}",
    "e.created_at < {to:DateTime}",
    ...filters,
  ].join("\n  AND ");
  const group = dims.length ? `\nGROUP BY ${dims.join(", ")}` : "";

  const sql = `SELECT ${select}
FROM event AS e SAMPLE 1000000
INNER JOIN (
  SELECT session_id
  FROM session
  WHERE project_id = {tenant:String}
    AND created_at >= {from:DateTime}
    AND created_at < {to:DateTime}
) AS s ON s.session_id = e.session_id
WHERE ${eventWhere}${group}`;

  return { sql, params };
}
