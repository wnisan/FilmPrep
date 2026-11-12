-- Readable film URLs: /media/le-fabuleux-destin-d-amelie-poulain instead of the UUID.
-- Values are filled by the API on start (transliteration lives in JS).
ALTER TABLE media_items ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS media_items_slug_idx ON media_items (slug);
