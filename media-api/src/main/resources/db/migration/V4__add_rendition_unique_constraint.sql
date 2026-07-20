-- Prevent duplicate renditions for the same media and quality
CREATE UNIQUE INDEX IF NOT EXISTS idx_renditions_media_quality
    ON renditions(media_id, quality);
