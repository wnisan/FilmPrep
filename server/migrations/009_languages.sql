-- Any study language, not only English

-- media_items.language (since 001) is the original language; subtitles: that language + Russian
CREATE INDEX IF NOT EXISTS media_items_language_idx ON media_items (language);

-- Languages the learner studies: [{"code":"es","level":"A2"}, …]; cefr_level mirrors the active one
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS learning_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_language TEXT NOT NULL DEFAULT 'en';

UPDATE users
SET learning_languages = jsonb_build_array(jsonb_build_object('code', 'en', 'level', cefr_level))
WHERE learning_languages = '[]'::jsonb;

-- Personal dictionary and translation cache are per language
ALTER TABLE user_words
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE user_words
  DROP CONSTRAINT IF EXISTS user_words_user_id_word_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_words_user_language_key_idx
  ON user_words (user_id, language, word_key);

ALTER TABLE word_translations
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE word_translations
  DROP CONSTRAINT IF EXISTS word_translations_pkey;
ALTER TABLE word_translations
  ADD CONSTRAINT word_translations_pkey PRIMARY KEY (language, word_key);
