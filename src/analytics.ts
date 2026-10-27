export type Metric = "visitors" | "pageviews";
export type Dimension = "page" | "referrer" | "country" | "device";

export type AnalyticsQuery = {
  metric: Metric;
  dimensions: Dimension[];
  filters: { dimension: Dimension; prefix: string }[];
  timeRange: { from: string; to: string };
  projectId: string;
};

const COLUMN: Record<Dimension, string> = {
  page: "e.page",
  referrer: "e.referrer",
  country: "e.country_code",
  device: "e.device",
};

const AGGREGATE: Record<Metric, string> = {
  visitors: "toUInt64(round(uniq(e.user_id) * any(_sample_factor)))",
  pageviews: "toUInt64(round(count() * any(_sample_factor)))",
};

/** Typed dashboard question → ClickHouse SQL. Values are interpolated. */
export function compileQuery(query: AnalyticsQuery): string {
  const project = `'${query.projectId}'`;
  const from = `toDateTime('${query.timeRange.from}')`;
  const to = `toDateTime('${query.timeRange.to}')`;
  const filters = query.filters
    .map((f) => `${COLUMN[f.dimension]} LIKE '${f.prefix}%'`)
    .join(" AND ");
  const dims = query.dimensions.map((d) => COLUMN[d]);
  const selectDims = dims.length ? `, ${dims.join(", ")}` : "";
  const where = [
    `e.project_id = ${project}`,
    `e.created_at >= ${from}`,
    `e.created_at < ${to}`,
    filters,
  ]
    .filter(Boolean)
    .join(" AND ");

  return `SELECT ${AGGREGATE[query.metric]} AS value${selectDims}
FROM event AS e SAMPLE 1000000
INNER JOIN (
  SELECT session_id
  FROM session
  WHERE project_id = ${project}
    AND created_at >= ${from}
    AND created_at < ${to}
) AS s ON s.session_id = e.session_id
WHERE ${where}${dims.length ? `\nGROUP BY ${dims.join(", ")}` : ""}`;
}
