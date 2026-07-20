package com.example.media.api.kafka;

import com.example.media.api.domain.Rendition;
import com.example.media.api.repo.RenditionRepository;
import com.example.media.common.events.MediaFailedEvent;
import com.example.media.common.events.MediaProcessedEvent;
import com.example.media.common.events.RenditionDto;
import com.example.media.common.kafka.Topics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Consistency backstop: consumes media.processed and media.failed events
 * to ensure DB state is correct even if the worker's direct JDBC update failed.
 */
@Component
public class ProcessedEventListener {

    private static final Logger log = LoggerFactory.getLogger(ProcessedEventListener.class);

    private final RenditionRepository renditionRepository;
    private final JdbcTemplate jdbc;

    public ProcessedEventListener(RenditionRepository renditionRepository, JdbcTemplate jdbc) {
        this.renditionRepository = renditionRepository;
        this.jdbc = jdbc;
    }

    @KafkaListener(topics = Topics.MEDIA_PROCESSED, groupId = "media-api",
            properties = {"spring.json.value.default.type=com.example.media.common.events.MediaProcessedEvent"})
    @Transactional
    public void onProcessed(MediaProcessedEvent evt) {
        UUID mediaId = UUID.fromString(evt.mediaId());

        // Atomic CAS: only update if not already READY.
        // Prevents race when two deliveries (redelivery + original) arrive concurrently.
        int updated = jdbc.update(
                "UPDATE media SET status = 'READY', hls_master_manifest_key = ?, " +
                "updated_at = now() AT TIME ZONE 'utc' WHERE id = ? AND status <> 'READY'",
                evt.hlsMasterManifestKey(), mediaId);

        if (updated == 0) {
            log.debug("Media {} already READY or not found, skipping backstop update", evt.mediaId());
            return;
        }

        // Ensure renditions exist - the CAS above guarantees only one thread reaches here
        if (evt.renditions() != null && renditionRepository.findByMediaId(mediaId).isEmpty()) {
            for (RenditionDto r : evt.renditions()) {
                Rendition rendition = new Rendition();
                rendition.setId(UUID.randomUUID());
                rendition.setMediaId(mediaId);
                rendition.setQuality(r.quality());
                rendition.setManifestKey(r.manifestKey());
                renditionRepository.save(rendition);
            }
        }

        log.info("Media {} marked READY via event backstop", evt.mediaId());
    }

    @KafkaListener(topics = Topics.MEDIA_FAILED, groupId = "media-api",
            properties = {"spring.json.value.default.type=com.example.media.common.events.MediaFailedEvent"})
    @Transactional
    public void onFailed(MediaFailedEvent evt) {
        UUID mediaId = UUID.fromString(evt.mediaId());

        // Atomic CAS: only update if not already FAILED
        int updated = jdbc.update(
                "UPDATE media SET status = 'FAILED', updated_at = now() AT TIME ZONE 'utc' " +
                "WHERE id = ? AND status <> 'FAILED'",
                mediaId);

        if (updated == 0) {
            log.debug("Media {} already FAILED or not found, skipping backstop update", evt.mediaId());
            return;
        }

        log.info("Media {} marked FAILED via event backstop: {}", evt.mediaId(), evt.errorMessage());
    }
}
