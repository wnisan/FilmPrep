-- HLS video in object storage (S3-compatible or local fallback)
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS video_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS video_storage_driver TEXT,
  ADD COLUMN IF NOT EXISTS video_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS video_stage TEXT,
  ADD COLUMN IF NOT EXISTS video_progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_error TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_sec INTEGER;

ALTER TABLE media_items
  DROP CONSTRAINT IF EXISTS media_items_video_status_check;
ALTER TABLE media_items
  ADD CONSTRAINT media_items_video_status_check
  CHECK (video_status IN ('none', 'processing', 'ready', 'failed'));

-- Subtitles: English for NLP + player, Russian for player
ALTER TABLE subtitles
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload';
