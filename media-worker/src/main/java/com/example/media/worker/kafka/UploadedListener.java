package com.example.media.worker.kafka;

import com.example.media.common.events.MediaFailedEvent;
import com.example.media.common.events.MediaProcessedEvent;
import com.example.media.common.events.MediaUploadedEvent;
import com.example.media.common.events.RenditionDto;
import com.example.media.common.kafka.Topics;
import com.example.media.worker.service.TranscodeService;
import io.minio.MinioClient;
import io.minio.GetObjectArgs;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Component
public class UploadedListener {
    private final JdbcTemplate jdbc;
    private final TranscodeService transcodeService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final MinioClient minio;
    private final String bucket;

    public UploadedListener(JdbcTemplate jdbc, TranscodeService transcodeService, KafkaTemplate<String, Object> kafkaTemplate, MinioClient minio, @Value("${app.minio.bucket}") String bucket) {
        this.jdbc = jdbc;
        this.transcodeService = transcodeService;
        this.kafkaTemplate = kafkaTemplate;
        this.minio = minio;
        this.bucket = bucket;
    }

    @KafkaListener(topics = Topics.MEDIA_UPLOADED, groupId = "media-worker")
    public void onUploaded(MediaUploadedEvent evt) {
        String mediaId = evt.mediaId();
        try {
            // Skip if already READY
            var status = jdbc.queryForObject("select status from media where id = ?", String.class, UUID.fromString(mediaId));
            if ("READY".equals(status)) return;

            UUID jobId = UUID.randomUUID();
            jdbc.update("insert into processing_jobs(id, media_id, stage, status, progress, started_at) values (?,?,?,?,?,?)",
                    jobId, UUID.fromString(mediaId), "TRANSCODE", "RUNNING", 0, OffsetDateTime.now(ZoneOffset.UTC));


            // Download from MinIO (FIX: use getObject + Files.copy)
            Path tmp = Files.createTempFile("raw-", ".bin");
            try (InputStream stream = minio.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucket)
                            .object(evt.rawObjectKey())
                            .build())) {
                Files.copy(stream, tmp, StandardCopyOption.REPLACE_EXISTING);
            }

            var out = transcodeService.transcodeToHls(tmp, mediaId);

            // Update DB
            jdbc.update("update media set status = ?, hls_master_manifest_key = ?, updated_at = now() at time zone 'utc' where id = ?",
                    "READY", out.masterKey(), UUID.fromString(mediaId));

            jdbc.update("update processing_jobs set status = ?, progress = ?, ended_at = now() at time zone 'utc' where id = ?",
                    "DONE", 100, jobId);

            var renditions = List.of(
                    new RenditionDto("720p", out.variantKeys().get(0)),
                    new RenditionDto("480p", out.variantKeys().get(1))
            );
            kafkaTemplate.send(Topics.MEDIA_PROCESSED, mediaId, new MediaProcessedEvent(mediaId, "READY", out.masterKey(), renditions, null, Instant.now()));
        } catch (Exception e) {
            e.printStackTrace(); // Print error for visibility
            kafkaTemplate.send(Topics.MEDIA_FAILED, mediaId, new MediaFailedEvent(mediaId, com.example.media.common.model.ProcessingStage.TRANSCODE, "ERROR", e.getMessage(), Instant.now()));
            jdbc.update("update media set status = ?, updated_at = now() at time zone 'utc' where id = ?",
                "FAILED", UUID.fromString(mediaId));
        }
    }
}
