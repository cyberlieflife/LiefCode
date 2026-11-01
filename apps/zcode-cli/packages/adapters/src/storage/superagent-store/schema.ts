/** SuperAgent 独立库的基线 schema。后续变更走 user_version 迁移，不改这里。 */
export const SUPERAGENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sa_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_settings_history (
  revision INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_trigger (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  threads_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  human INTEGER NOT NULL,
  addressed TEXT,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  channel_json TEXT NOT NULL,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS sa_thread (
  key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  meta_json TEXT,
  context_json TEXT NOT NULL,
  subscriptions_json TEXT NOT NULL,
  expired_evals INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_ticket (
  id TEXT PRIMARY KEY,
  short_name TEXT NOT NULL,
  title TEXT NOT NULL,
  open INTEGER NOT NULL,
  origin_json TEXT NOT NULL,
  mandate_json TEXT NOT NULL,
  execution_json TEXT NOT NULL,
  assignment_json TEXT,
  delivery_json TEXT,
  follows_json TEXT NOT NULL,
  latest_report_json TEXT,
  inputs_json TEXT NOT NULL,
  last_human_input_at INTEGER,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS sa_decision (
  id TEXT PRIMARY KEY,
  thread TEXT NOT NULL,
  trigger_ids_json TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  rule_ids_json TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_eval (
  thread TEXT PRIMARY KEY,
  trigger_ids_json TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  delivered_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sa_effect (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_kv (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_health (
  part TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_prompt_revision (
  revision INTEGER PRIMARY KEY,
  config_json TEXT NOT NULL,
  predecessor INTEGER,
  origin TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sa_runtime_lease (
  workspace_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sa_ticket_open ON sa_ticket (open);
CREATE INDEX IF NOT EXISTS idx_sa_effect_due ON sa_effect (kind, next_at);
CREATE INDEX IF NOT EXISTS idx_sa_decision_thread ON sa_decision (thread, at);
`;
