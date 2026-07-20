-- Add index on media.owner_id for findByOwnerId queries (previously full table scan)
CREATE INDEX IF NOT EXISTS idx_media_owner_id ON media(owner_id);
