package com.example.media.api.kafka;

import com.example.media.api.domain.Media;
import com.example.media.api.domain.Rendition;
import com.example.media.api.repo.MediaRepository;
import com.example.media.api.repo.RenditionRepository;
import com.example.media.common.events.MediaFailedEvent;
import com.example.media.common.events.MediaProcessedEvent;
import com.example.media.common.events.RenditionDto;
import com.example.media.common.kafka.Topics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Consistency backstop: consumes media.processed and media.failed events
 * to ensure DB state is correct even if the worker's direct JDBC update failed.
 */
@Component
public class ProcessedEventListener {

    private static final Logger log = LoggerFactory.getLogger(ProcessedEventListener.class);

    private final MediaRepository mediaRepository;
    private final RenditionRepository renditionRepository;

    public ProcessedEventListener(MediaRepository mediaRepository, RenditionRepository renditionRepository) {
        this.mediaRepository = mediaRepository;
        this.renditionRepository = renditionRepository;
    }

    @KafkaListener(topics = Topics.MEDIA_PROCESSED, groupId = "media-api",
            properties = {"spring.json.value.default.type=com.example.media.common.events.MediaProcessedEvent"})
    @Transactional
    public void onProcessed(MediaProcessedEvent evt) {
        UUID mediaId = UUID.fromString(evt.mediaId());
        Media media = mediaRepository.findById(mediaId).orElse(null);
        if (media == null) {
            log.warn("Received processed event for unknown media {}", evt.mediaId());
            return;
        }

        if ("READY".equals(media.getStatus())) {
            return; // Already updated by worker's direct JDBC
        }

        media.setStatus("READY");
        media.setHlsMasterManifestKey(evt.hlsMasterManifestKey());
        media.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mediaRepository.save(media);

        // Ensure renditions exist
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
        Media media = mediaRepository.findById(mediaId).orElse(null);
        if (media == null) {
            log.warn("Received failed event for unknown media {}", evt.mediaId());
            return;
        }

        if ("FAILED".equals(media.getStatus())) {
            return; // Already updated
        }

        media.setStatus("FAILED");
        media.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mediaRepository.save(media);

        log.info("Media {} marked FAILED via event backstop: {}", evt.mediaId(), evt.errorMessage());
    }
}
