package com.example.media.api.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "media")
public class Media {
    @Id
    private UUID id;
    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String type; // VIDEO/AUDIO
    @Column(nullable = false)
    private String status; // UPLOADING/PROCESSING/READY/FAILED
    @Column(name = "raw_object_key")
    private String rawObjectKey;
    @Column(name = "hls_master_manifest_key")
    private String hlsMasterManifestKey;
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getOwnerId() { return ownerId; }
    public void setOwnerId(UUID ownerId) { this.ownerId = ownerId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRawObjectKey() { return rawObjectKey; }
    public void setRawObjectKey(String rawObjectKey) { this.rawObjectKey = rawObjectKey; }
    public String getHlsMasterManifestKey() { return hlsMasterManifestKey; }
    public void setHlsMasterManifestKey(String hlsMasterManifestKey) { this.hlsMasterManifestKey = hlsMasterManifestKey; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
