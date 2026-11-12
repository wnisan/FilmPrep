-- Personal dictionary: words saved from subtitles, the film vocabulary or typed by hand
CREATE TABLE IF NOT EXISTS user_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  word TEXT NOT NULL CHECK (char_length(word) BETWEEN 1 AND 80),
  word_key TEXT NOT NULL,
  translation TEXT,
  context TEXT,
  note TEXT,
  media_id UUID REFERENCES media_items (id) ON DELETE SET NULL,
  lexicon_entry_id UUID REFERENCES lexicon_entries (id) ON DELETE SET NULL,
  timestamp_ms INT CHECK (timestamp_ms IS NULL OR timestamp_ms >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('subtitle', 'lexicon', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, word_key)
);

CREATE INDEX IF NOT EXISTS user_words_user_created_idx ON user_words (user_id, created_at DESC);

-- Cache for single-word translations (lexicon lookup / LLM), shared by all users
CREATE TABLE IF NOT EXISTS word_translations (
  word_key TEXT PRIMARY KEY,
  translation TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily goal (words per day) and reminder settings
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_goal INT NOT NULL DEFAULT 10 CHECK (daily_goal BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_time TEXT NOT NULL DEFAULT '19:00'
    CHECK (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
