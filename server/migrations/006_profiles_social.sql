-- Public profiles: nickname, bio, avatar
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- Existing accounts get a nickname from the email local part (admin@… → admin, dup → admin2)
WITH base AS (
  SELECT id, created_at,
         left(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]', '_', 'g'), 20) AS b
  FROM users
  WHERE username IS NULL
), fixed AS (
  SELECT id, created_at, CASE WHEN length(b) < 3 THEN b || '_user' ELSE b END AS b
  FROM base
), numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY created_at) AS n
  FROM fixed
)
UPDATE users u
SET username = CASE WHEN numbered.n = 1 THEN numbered.b ELSE numbered.b || numbered.n END
FROM numbered
WHERE u.id = numbered.id;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users
  ADD CONSTRAINT users_username_format_chk CHECK (username ~ '^[a-z0-9_]{3,24}$');
CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON users (username);

-- Comments with one-level-or-deeper replies (parent_id)
CREATE TABLE IF NOT EXISTS media_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id UUID REFERENCES media_comments (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- a deleted comment with replies stays as a placeholder so the thread keeps its shape
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS media_comments_media_idx ON media_comments (media_id, created_at);
CREATE INDEX IF NOT EXISTS media_comments_user_idx ON media_comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_comments_parent_idx ON media_comments (parent_id);

CREATE TABLE IF NOT EXISTS media_ratings (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, media_id)
);

CREATE INDEX IF NOT EXISTS media_ratings_media_idx ON media_ratings (media_id);

CREATE TABLE IF NOT EXISTS media_favorites (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, media_id)
);

CREATE INDEX IF NOT EXISTS media_favorites_media_idx ON media_favorites (media_id);
