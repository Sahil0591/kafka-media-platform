package com.example.media.common.events;

import com.example.media.common.model.ProcessingStage;

import java.time.Instant;

public record MediaFailedEvent(
        String mediaId,
        ProcessingStage stage,
        String errorCode,
        String errorMessage,
        Instant timestamp
) {}
