package com.example.media.api.stream;

import java.time.Instant;

/**
 * Normalized envelope pushed to browser clients over SSE.
 *
 * <p>Every Kafka event the API observes is flattened into this shape so the
 * front-end has a single contract to render against, regardless of which topic
 * the event originated from.
 *
 * @param type      logical event name - "progress", "processed", "failed"
 * @param topic     Kafka topic the record was read from
 * @param partition partition the record landed on
 * @param offset    offset within that partition
 * @param mediaId   media the event refers to
 * @param status    coarse media status implied by this event
 * @param stage     pipeline stage - TRANSCODE, PACKAGE, UPLOAD
 * @param progress  0-100 completion for the current stage, null when unknown
 * @param message   human readable detail
 * @param lagMs     time between the producer stamping the event and the API consuming it
 * @param timestamp producer-side event time
 */
public record StreamEvent(
        String type,
        String topic,
        Integer partition,
        Long offset,
        String mediaId,
        String status,
        String stage,
        Integer progress,
        String message,
        Long lagMs,
        Instant timestamp
) {
    /** Strips media-identifying fields for the cluster-wide firehose. */
    public StreamEvent anonymized() {
        return new StreamEvent(type, topic, partition, offset, null, status, stage,
                progress, null, lagMs, timestamp);
    }
}
