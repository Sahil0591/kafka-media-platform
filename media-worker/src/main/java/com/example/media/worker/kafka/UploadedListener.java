package com.example.media.worker.kafka;

import com.example.media.common.events.MediaFailedEvent;
import com.example.media.common.events.MediaProcessedEvent;
import com.example.media.common.events.MediaUploadedEvent;
import com.example.media.common.events.RenditionDto;
import com.example.media.common.kafka.Topics;
import com.example.media.common.model.MediaType;
import com.example.media.common.model.ProcessingStage;
import com.example.media.worker.service.TranscodeService;
import io.minio.MinioClient;
import io.minio.GetObjectArgs;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class UploadedListener {
    private static final Logger log = LoggerFactory.getLogger(UploadedListener.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate txTemplate;
    private final TranscodeService transcodeService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final MinioClient minio;
    private final String bucket;

    public UploadedListener(JdbcTemplate jdbc, TransactionTemplate txTemplate,
                            TranscodeService transcodeService,
                            KafkaTemplate<String, Object> kafkaTemplate, MinioClient minio,
                            @Value("${app.minio.bucket}") String bucket) {
        this.jdbc = jdbc;
        this.txTemplate = txTemplate;
        this.transcodeService = transcodeService;
        this.kafkaTemplate = kafkaTemplate;
        this.minio = minio;
        this.bucket = bucket;
    }

    @KafkaListener(topics = Topics.MEDIA_UPLOADED, groupId = "media-worker")
    public void onUploaded(MediaUploadedEvent evt) {
        String mediaId = evt.mediaId();
        UUID mediaUuid = UUID.fromString(mediaId);
        UUID jobId = null;
        Path tmp = null;
        boolean eventPublished = false;

        try {
            // Atomic CAS: claim this media by transitioning PROCESSING -> TRANSCODING.
            // Only one consumer wins; duplicates see 0 rows updated and skip.
            int claimed = jdbc.update(
                    "UPDATE media SET status = 'TRANSCODING', updated_at = now() AT TIME ZONE 'utc' " +
                    "WHERE id = ? AND status = 'PROCESSING'",
                    mediaUuid);
            if (claimed == 0) {
                log.info("Skipping media {} - not in PROCESSING state (already claimed or completed)", mediaId);
                return;
            }

            jobId = UUID.randomUUID();
            jdbc.update("INSERT INTO processing_jobs(id, media_id, stage, status, progress, started_at) VALUES (?,?,?,?,?,?)",
                    jobId, mediaUuid, "TRANSCODE", "RUNNING", 0, OffsetDateTime.now(ZoneOffset.UTC));

            // Download raw file from MinIO
            tmp = Files.createTempFile("raw-", ".bin");
            try (InputStream stream = minio.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucket)
                            .object(evt.rawObjectKey())
                            .build())) {
                Files.copy(stream, tmp, StandardCopyOption.REPLACE_EXISTING);
            }

            final UUID progressJobId = jobId;
            var out = transcodeService.transcodeToHls(tmp, mediaId, evt.type(), (pct, stage) -> {
                // Progress tracked via DB only - no Kafka consumer exists for
                // media.transcode.progress, so publishing there is wasted I/O.
                try {
                    jdbc.update("UPDATE processing_jobs SET progress = ? WHERE id = ?", pct, progressJobId);
                } catch (Exception ex) {
                    log.debug("Failed to update progress for job {}: {}", progressJobId, ex.getMessage());
                }
            });

            // Build renditions list before publishing the event
            List<RenditionDto> renditions;
            if (evt.type() == MediaType.AUDIO) {
                renditions = List.of(new RenditionDto("audio", out.variantKeys().get(0)));
            } else {
                renditions = List.of(
                        new RenditionDto("720p", out.variantKeys().get(0)),
                        new RenditionDto("480p", out.variantKeys().get(1)));
            }

            // Publish Kafka event BEFORE updating DB. If send fails, DB stays
            // in TRANSCODING and the catch block cleanly transitions to FAILED.
            // If send succeeds but DB update fails, the ProcessedEventListener
            // backstop reconciles from the published event.
            kafkaTemplate.send(Topics.MEDIA_PROCESSED, mediaId,
                    new MediaProcessedEvent(mediaId, "READY", out.masterKey(), renditions, out.durationSeconds(), Instant.now()))
                    .get(30, TimeUnit.SECONDS);
            eventPublished = true;

            // Atomically update DB: READY + job DONE + renditions in one transaction.
            // Using TransactionTemplate (not @Transactional) so the DB connection is
            // not held for the entire multi-minute transcode.
            final UUID finalJobId = jobId;
            txTemplate.executeWithoutResult(status -> {
                jdbc.update("UPDATE media SET status = 'READY', hls_master_manifest_key = ?, " +
                        "updated_at = now() AT TIME ZONE 'utc' WHERE id = ?",
                        out.masterKey(), mediaUuid);

                jdbc.update("UPDATE processing_jobs SET status = 'DONE', progress = 100, " +
                        "ended_at = now() AT TIME ZONE 'utc' WHERE id = ?", finalJobId);

                for (RenditionDto r : renditions) {
                    jdbc.update("INSERT INTO renditions(id, media_id, quality, manifest_key) " +
                            "VALUES (?,?,?,?) ON CONFLICT (media_id, quality) DO NOTHING",
                            UUID.randomUUID(), mediaUuid, r.quality(), r.manifestKey());
                }
            });

            log.info("Media {} processed successfully", mediaId);
        } catch (Exception e) {
            // Re-interrupt the thread if shutdown was requested so the consumer
            // container can terminate cleanly instead of hanging until
            // max.poll.interval.ms expires.
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }

            log.error("Processing failed for media {}", mediaId, e);

            // Only send media.failed if the processed event was NOT published.
            // If it was, the backstop will reconcile from the published event -
            // sending both processed and failed creates a race condition.
            if (!eventPublished) {
                try {
                    kafkaTemplate.send(Topics.MEDIA_FAILED, mediaId,
                            new MediaFailedEvent(mediaId, ProcessingStage.TRANSCODE,
                                    "ERROR", e.getMessage(), Instant.now()))
                            .get(30, TimeUnit.SECONDS);
                } catch (Exception sendEx) {
                    log.error("Failed to publish media.failed event for {}", mediaId, sendEx);
                }
            } else {
                log.warn("Media {} - Kafka event published but DB transaction failed. " +
                        "Backstop listener will reconcile.", mediaId);
            }

            // CAS update: only transition TRANSCODING -> FAILED.
            // Never overwrite READY if the backstop already reconciled.
            jdbc.update("UPDATE media SET status = 'FAILED', updated_at = now() AT TIME ZONE 'utc' " +
                    "WHERE id = ? AND status = 'TRANSCODING'", mediaUuid);

            // Update processing job with failure details
            if (jobId != null) {
                jdbc.update("UPDATE processing_jobs SET status = 'FAILED', error_message = ?, " +
                        "ended_at = now() AT TIME ZONE 'utc' WHERE id = ?",
                        e.getMessage(), jobId);
            }
        } finally {
            // Clean up temp file
            if (tmp != null) {
                try { Files.deleteIfExists(tmp); } catch (Exception ignored) {}
            }
        }
    }
}
