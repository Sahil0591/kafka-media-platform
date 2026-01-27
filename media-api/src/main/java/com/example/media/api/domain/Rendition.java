package com.example.media.api.domain;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "renditions")
public class Rendition {
    @Id
    private UUID id;
    @Column(name = "media_id", nullable = false)
    private UUID mediaId;
    @Column(nullable = false)
    private String quality;
    @Column(name = "manifest_key", nullable = false)
    private String manifestKey;
    @Column
    private String codec;
    @Column(name = "bitrate_kbps")
    private Integer bitrateKbps;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getMediaId() { return mediaId; }
    public void setMediaId(UUID mediaId) { this.mediaId = mediaId; }
    public String getQuality() { return quality; }
    public void setQuality(String quality) { this.quality = quality; }
    public String getManifestKey() { return manifestKey; }
    public void setManifestKey(String manifestKey) { this.manifestKey = manifestKey; }
    public String getCodec() { return codec; }
    public void setCodec(String codec) { this.codec = codec; }
    public Integer getBitrateKbps() { return bitrateKbps; }
    public void setBitrateKbps(Integer bitrateKbps) { this.bitrateKbps = bitrateKbps; }
}
