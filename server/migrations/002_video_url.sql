-- In-site video playback (YouTube / direct MP4 / uploaded file path)
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS video_url TEXT;
