-- Grammar rules the learner marked as learned ("Мои правила")
CREATE TABLE IF NOT EXISTS grammar_learned (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pattern_id UUID NOT NULL REFERENCES grammar_patterns (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pattern_id)
);

CREATE INDEX IF NOT EXISTS grammar_learned_user_idx ON grammar_learned (user_id, created_at DESC);
