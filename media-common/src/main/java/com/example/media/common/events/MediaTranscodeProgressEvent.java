package com.example.media.common.events;

import com.example.media.common.model.ProcessingStage;

import java.time.Instant;

public record MediaTranscodeProgressEvent(
        String mediaId,
        ProcessingStage stage,
        int progress,
        String message,
        Instant timestamp
) {}
