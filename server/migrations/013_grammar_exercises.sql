-- Gap-fill exercises generated once per rule (language + rule title) and reused by every learner
CREATE TABLE IF NOT EXISTS grammar_exercises (
  rule_key TEXT PRIMARY KEY,
  items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
