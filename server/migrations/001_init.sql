-- FilmPrep initial schema
-- PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users & auth
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'learner'
    CHECK (role IN ('learner', 'admin')),
  cefr_level TEXT
    CHECK (cefr_level IS NULL OR cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lower_chk CHECK (email = lower(email))
);

CREATE UNIQUE INDEX users_email_uidx ON users (email);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE UNIQUE INDEX refresh_tokens_token_hash_uidx ON refresh_tokens (token_hash);

-- ---------------------------------------------------------------------------
-- Media catalog
-- ---------------------------------------------------------------------------

CREATE TABLE media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  year INT CHECK (year IS NULL OR (year >= 1888 AND year <= 2100)),
  genres TEXT[] NOT NULL DEFAULT '{}',
  themes TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL DEFAULT 'en',
  recommended_level TEXT
    CHECK (recommended_level IS NULL OR recommended_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  poster_url TEXT,
  external_watch_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX media_items_status_idx ON media_items (status);
CREATE INDEX media_items_recommended_level_idx ON media_items (recommended_level);
CREATE INDEX media_items_themes_gin_idx ON media_items USING GIN (themes);
CREATE INDEX media_items_genres_gin_idx ON media_items USING GIN (genres);
CREATE INDEX media_items_title_trgm_ready_idx ON media_items (lower(title));

-- ---------------------------------------------------------------------------
-- Subtitles & NLP jobs
-- ---------------------------------------------------------------------------

CREATE TABLE subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('srt', 'vtt')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX subtitles_media_id_idx ON subtitles (media_id);

CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  subtitle_id UUID NOT NULL REFERENCES subtitles (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX processing_jobs_status_idx ON processing_jobs (status);
CREATE INDEX processing_jobs_media_id_idx ON processing_jobs (media_id);

-- ---------------------------------------------------------------------------
-- Learning materials (from NLP / admin edits)
-- ---------------------------------------------------------------------------

CREATE TABLE lexicon_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  lemma TEXT NOT NULL,
  surface_forms TEXT[] NOT NULL DEFAULT '{}',
  cefr_level TEXT
    CHECK (cefr_level IS NULL OR cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  frequency INT NOT NULL DEFAULT 1 CHECK (frequency >= 0),
  definition_ru TEXT,
  example_subtitle TEXT,
  timestamp_ms INT CHECK (timestamp_ms IS NULL OR timestamp_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX lexicon_entries_media_id_idx ON lexicon_entries (media_id);
CREATE INDEX lexicon_entries_lemma_idx ON lexicon_entries (media_id, lower(lemma));

CREATE TABLE phrases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  translation_ru TEXT,
  note TEXT,
  timestamp_ms INT CHECK (timestamp_ms IS NULL OR timestamp_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX phrases_media_id_idx ON phrases (media_id);

CREATE TABLE grammar_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  explanation_ru TEXT,
  example TEXT,
  pattern_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX grammar_patterns_media_id_idx ON grammar_patterns (media_id);

-- ---------------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------------

CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Тест по фильму',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quizzes_one_per_media_uidx UNIQUE (media_id)
);

CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('single_choice', 'true_false', 'matching', 'fill_blank')),
  prompt TEXT NOT NULL,
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_json JSONB NOT NULL,
  explanation TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX quiz_questions_quiz_id_idx ON quiz_questions (quiz_id, sort_order);

CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  score NUMERIC(6, 2) NOT NULL CHECK (score >= 0),
  max_score NUMERIC(6, 2) NOT NULL CHECK (max_score > 0),
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX quiz_attempts_user_id_idx ON quiz_attempts (user_id);
CREATE INDEX quiz_attempts_quiz_id_idx ON quiz_attempts (quiz_id);
CREATE INDEX quiz_attempts_user_quiz_idx ON quiz_attempts (user_id, quiz_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Progress
-- ---------------------------------------------------------------------------

CREATE TABLE learning_progress (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  lexicon_learned_count INT NOT NULL DEFAULT 0 CHECK (lexicon_learned_count >= 0),
  materials_opened_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, media_id)
);

CREATE INDEX learning_progress_user_id_idx ON learning_progress (user_id);
