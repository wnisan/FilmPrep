-- Long description for the film page (short `description` stays for catalog cards)
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS synopsis TEXT NOT NULL DEFAULT '';

-- CEFR level of a grammar construction
ALTER TABLE grammar_patterns
  ADD COLUMN IF NOT EXISTS cefr_level TEXT
    CHECK (cefr_level IS NULL OR cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- Words a learner marked as learned
CREATE TABLE IF NOT EXISTS lexicon_learned (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES lexicon_entries (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS lexicon_learned_user_idx ON lexicon_learned (user_id);
