-- Personal films: uploaded by a learner, visible only to them (status 'private')
ALTER TABLE media_items DROP CONSTRAINT IF EXISTS media_items_status_check;
ALTER TABLE media_items
  ADD CONSTRAINT media_items_status_check CHECK (status IN ('draft', 'published', 'private'));

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS media_items_owner_idx ON media_items (owner_id) WHERE owner_id IS NOT NULL;
