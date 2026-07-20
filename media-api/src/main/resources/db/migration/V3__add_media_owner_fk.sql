-- Convert owner_id from VARCHAR to UUID and add FK with cascade delete
ALTER TABLE media
    ALTER COLUMN owner_id TYPE UUID USING owner_id::UUID;

ALTER TABLE media
    ADD CONSTRAINT fk_media_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;