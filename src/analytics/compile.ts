export type Metric = "visitors" | "pageviews";
export type Dimension = "page" | "referrer" | "country" | "device";

export type Filter = {
  dimension: Dimension;
  prefix: string;
};

export type TimeRange = {
  from: string;
  to: string;
};

/**
 * The dashboard's question.
 * `projectId` is whatever the caller sent. Auth did not choose it.
 */
export type AnalyticsQuery = {
  metric: Metric;
  dimensions: Dimension[];
  filters: Filter[];
  timeRange: TimeRange;
  projectId: string;
};

export const COLUMN: Record<Dimension, string> = {
  page: "e.page",
  referrer: "e.referrer",
  country: "e.country_code",
  device: "e.device",
};

export const AGGREGATE: Record<Metric, string> = {
  visitors: "toUInt64(round(uniq(e.user_id) * any(_sample_factor)))",
  pageviews: "toUInt64(round(count() * any(_sample_factor)))",
};

const SAMPLE = 1_000_000;

/**
 * Historical compiler. Values are interpolated, and this function does not escape them.
 * A cleaner upstream replaced quotes in filter values only. The project id never went through it.
 * Visitors are uniq(user_id), not visitor_id. uniq is approximate, then scaled by the sample factor.
 * The project predicate is on both sides of the join so each table is reduced first.
 * A string filter is a prefix match.
 */
export function compileHistorical(query: AnalyticsQuery): string {
  const project = `'${query.projectId}'`;
  const from = `toDateTime('${query.timeRange.from}')`;
  const to = `toDateTime('${query.timeRange.to}')`;
  const filters = query.filters
    .map((filter) => `${COLUMN[filter.dimension]} LIKE '${filter.prefix}%'`)
    .join(" AND ");
  const dims = query.dimensions.map((dimension) => COLUMN[dimension]);
  const selectDims = dims.length ? `, ${dims.join(", ")}` : "";
  const where = [
    `e.project_id = ${project}`,
    `e.created_at >= ${from}`,
    `e.created_at < ${to}`,
    filters,
  ]
    .filter((part) => part.length > 0)
    .join(" AND ");

  return `SELECT ${AGGREGATE[query.metric]} AS value${selectDims}
FROM event AS e SAMPLE ${SAMPLE}
INNER JOIN (
  SELECT session_id
  FROM session
  WHERE project_id = ${project}
    AND created_at >= ${from}
    AND created_at < ${to}
) AS s ON s.session_id = e.session_id
WHERE ${where}${dims.length ? `\nGROUP BY ${dims.join(", ")}` : ""}`;
}
