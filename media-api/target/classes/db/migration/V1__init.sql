CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY,
  owner_id VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  raw_object_key VARCHAR(1024),
  hls_master_manifest_key VARCHAR(1024),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS renditions (
  id UUID PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  quality VARCHAR(50) NOT NULL,
  manifest_key VARCHAR(1024) NOT NULL,
  codec VARCHAR(50),
  bitrate_kbps INT
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  stage VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  progress INT NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_media_started
  ON processing_jobs(media_id, started_at DESC);
