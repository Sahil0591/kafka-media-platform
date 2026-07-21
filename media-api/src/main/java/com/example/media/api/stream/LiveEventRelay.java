package com.example.media.api.stream;

import com.example.media.api.repo.MediaRepository;
import com.example.media.common.events.MediaFailedEvent;
import com.example.media.common.events.MediaProcessedEvent;
import com.example.media.common.events.MediaTranscodeProgressEvent;
import com.example.media.common.kafka.Topics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Bridges the Kafka pipeline to connected browsers.
 *
 * <p>Runs in its own consumer group so every API instance sees every record -
 * this is a fan-out concern, not a work-sharing one. The group id carries a
 * random suffix per instance for exactly that reason.
 *
 * <p>Persistence remains the job of {@link com.example.media.api.kafka.ProcessedEventListener}.
 * Nothing here is allowed to throw: a broken UI subscriber must never stall the
 * pipeline or push a record toward the DLT.
 */
@Component
public class LiveEventRelay {

    private static final Logger log = LoggerFactory.getLogger(LiveEventRelay.class);

    private static final int OWNER_CACHE_CAPACITY = 512;

    private final LiveEventBroadcaster broadcaster;
    private final MediaRepository mediaRepository;

    /** Bounded LRU: progress events arrive far too often to hit Postgres each time. */
    private final Map<UUID, UUID> ownerCache = Collections.synchronizedMap(
            new LinkedHashMap<>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<UUID, UUID> eldest) {
                    return size() > OWNER_CACHE_CAPACITY;
                }
            });

    public LiveEventRelay(LiveEventBroadcaster broadcaster, MediaRepository mediaRepository) {
        this.broadcaster = broadcaster;
        this.mediaRepository = mediaRepository;
    }

    @KafkaListener(
            topics = Topics.MEDIA_TRANSCODE_PROGRESS,
            groupId = "#{T(com.example.media.api.stream.RelayGroup).ID}",
            properties = {
                    "auto.offset.reset=latest",
                    "spring.json.value.default.type=com.example.media.common.events.MediaTranscodeProgressEvent"})
    public void onProgress(MediaTranscodeProgressEvent evt,
                           @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                           @Header(KafkaHeaders.OFFSET) long offset) {
        relay(() -> new StreamEvent(
                "progress",
                Topics.MEDIA_TRANSCODE_PROGRESS,
                partition,
                offset,
                evt.mediaId(),
                "TRANSCODING",
                evt.stage() == null ? null : evt.stage().name(),
                evt.progress(),
                evt.message(),
                lagMs(evt.timestamp()),
                evt.timestamp()
        ), evt.mediaId());
    }

    @KafkaListener(
            topics = Topics.MEDIA_PROCESSED,
            groupId = "#{T(com.example.media.api.stream.RelayGroup).ID}",
            properties = {
                    "auto.offset.reset=latest",
                    "spring.json.value.default.type=com.example.media.common.events.MediaProcessedEvent"})
    public void onProcessed(MediaProcessedEvent evt,
                            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                            @Header(KafkaHeaders.OFFSET) long offset) {
        relay(() -> new StreamEvent(
                "processed",
                Topics.MEDIA_PROCESSED,
                partition,
                offset,
                evt.mediaId(),
                "READY",
                null,
                100,
                renditionSummary(evt),
                lagMs(evt.timestamp()),
                evt.timestamp()
        ), evt.mediaId());
    }

    @KafkaListener(
            topics = Topics.MEDIA_FAILED,
            groupId = "#{T(com.example.media.api.stream.RelayGroup).ID}",
            properties = {
                    "auto.offset.reset=latest",
                    "spring.json.value.default.type=com.example.media.common.events.MediaFailedEvent"})
    public void onFailed(MediaFailedEvent evt,
                         @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                         @Header(KafkaHeaders.OFFSET) long offset) {
        relay(() -> new StreamEvent(
                "failed",
                Topics.MEDIA_FAILED,
                partition,
                offset,
                evt.mediaId(),
                "FAILED",
                evt.stage() == null ? null : evt.stage().name(),
                null,
                evt.errorMessage(),
                lagMs(evt.timestamp()),
                evt.timestamp()
        ), evt.mediaId());
    }

    private void relay(java.util.function.Supplier<StreamEvent> builder, String mediaId) {
        try {
            broadcaster.publish(resolveOwner(mediaId), builder.get());
        } catch (Exception e) {
            log.warn("Live relay failed for media {}: {}", mediaId, e.toString());
        }
    }

    private UUID resolveOwner(String mediaId) {
        if (mediaId == null) {
            return null;
        }
        UUID id;
        try {
            id = UUID.fromString(mediaId);
        } catch (IllegalArgumentException e) {
            return null;
        }
        UUID cached = ownerCache.get(id);
        if (cached != null) {
            return cached;
        }
        Optional<UUID> owner = mediaRepository.findById(id).map(m -> m.getOwnerId());
        owner.ifPresent(value -> ownerCache.put(id, value));
        return owner.orElse(null);
    }

    private static Long lagMs(Instant producedAt) {
        return producedAt == null ? null : Math.max(0L, Instant.now().toEpochMilli() - producedAt.toEpochMilli());
    }

    private static String renditionSummary(MediaProcessedEvent evt) {
        if (evt.renditions() == null || evt.renditions().isEmpty()) {
            return "Processing complete";
        }
        StringBuilder sb = new StringBuilder("Ready in ");
        for (int i = 0; i < evt.renditions().size(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(evt.renditions().get(i).quality());
        }
        return sb.toString();
    }
}
