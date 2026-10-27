-- Events are facts. Sessions are derived state: sign collapses a version.
-- The session order key is the collapse key. created_at stays when a session is extended.
-- uniq() is approximate. One insert per event; ClickHouse prefers batches.
-- Teaching key: project, then time, then visitor, with SAMPLE BY on the visitor.
-- The live event table ordered by event name first and did not declare SAMPLE BY.
-- Queries sampled anyway. The live session table partitioned by updated_at.
-- ip is here because the address was stored, not only hashed.
-- Scans and uniqs are why this is a column store. Volume was not measured.

CREATE TABLE event (
  project_id String,
  event_id String,
  visitor_id UInt64,
  user_id String,
  session_id UInt64,
  name LowCardinality(String),
  page String,
  referrer String,
  country_code LowCardinality(String),
  device LowCardinality(String),
  ip String,
  created_at DateTime('Asia/Riyadh')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, created_at, visitor_id)
SAMPLE BY visitor_id
TTL created_at + INTERVAL 24 MONTH;

CREATE TABLE session (
  sign Int8,
  project_id String,
  visitor_id UInt64,
  user_id String,
  session_id UInt64,
  entry_page String,
  exit_page String,
  created_at DateTime('Asia/Riyadh'),
  updated_at DateTime('Asia/Riyadh')
)
ENGINE = CollapsingMergeTree(sign)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, visitor_id, session_id, created_at)
TTL created_at + INTERVAL 24 MONTH;
