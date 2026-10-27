-- Events are facts. Sessions are derived: sign collapses a version.
-- created_at stays on extend so both rows share one order key.

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
ORDER BY (name, project_id, visitor_id, created_at)
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
PARTITION BY toYYYYMM(updated_at)
ORDER BY (project_id, visitor_id, session_id, created_at)
TTL created_at + INTERVAL 24 MONTH;
