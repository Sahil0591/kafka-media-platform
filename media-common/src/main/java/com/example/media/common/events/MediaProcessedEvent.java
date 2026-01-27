package com.example.media.common.events;

import java.time.Instant;
import java.util.List;

public record MediaProcessedEvent(
        String mediaId,
        String status,
        String hlsMasterManifestKey,
        List<RenditionDto> renditions,
        Integer durationSeconds,
        Instant timestamp
) {}
