-- Catalog filters: production countries, director, runtime
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS countries TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS director TEXT,
  ADD COLUMN IF NOT EXISTS runtime_min INT CHECK (runtime_min IS NULL OR runtime_min BETWEEN 1 AND 1000);

CREATE INDEX IF NOT EXISTS media_items_countries_gin_idx ON media_items USING GIN (countries);
CREATE INDEX IF NOT EXISTS media_items_year_idx ON media_items (year);
