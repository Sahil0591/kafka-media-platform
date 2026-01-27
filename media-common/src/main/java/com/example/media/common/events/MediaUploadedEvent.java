package com.example.media.common.events;

import com.example.media.common.model.MediaType;

import java.time.Instant;

public record MediaUploadedEvent(
        String mediaId,
        String ownerId,
        MediaType type,
        String rawObjectKey,
        String filename,
        String contentType,
        Instant createdAt
) {}
