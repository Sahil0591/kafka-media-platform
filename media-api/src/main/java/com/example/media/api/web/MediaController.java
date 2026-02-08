package com.example.media.api.web;

import com.example.media.api.domain.Media;
import com.example.media.api.repo.MediaRepository;
import com.example.media.api.repo.ProcessingJobRepository;
import com.example.media.api.repo.RenditionRepository;
import com.example.media.common.events.MediaUploadedEvent;
import com.example.media.common.kafka.Topics;
import com.example.media.common.model.MediaType;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/media")
@Validated
public class MediaController {

    private final MediaRepository mediaRepository;
    private final ProcessingJobRepository jobRepository;
    private final RenditionRepository renditionRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final MinioClient minioClient;
    private final String bucket;
    private final String publicBaseUrl;

    public MediaController(MediaRepository mediaRepository,
                           ProcessingJobRepository jobRepository,
                           RenditionRepository renditionRepository,
                           KafkaTemplate<String, Object> kafkaTemplate,
                           MinioClient minioClient,
                           @Value("${app.minio.bucket}") String bucket,
                           @Value("${app.public-base-url}") String publicBaseUrl) {
        this.mediaRepository = mediaRepository;
        this.jobRepository = jobRepository;
        this.renditionRepository = renditionRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.minioClient = minioClient;
        this.bucket = bucket;
        this.publicBaseUrl = publicBaseUrl;
    }

    public record InitUploadRequest(String title, String type, String filename, String contentType) {}
    public record InitUploadResponse(UUID mediaId, String objectKey) {}

    @PostMapping("/init-upload")
    @Transactional
    public InitUploadResponse initUpload(@RequestBody InitUploadRequest req) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        Media m = new Media();
        m.setId(id);
        m.setOwnerId("user-1");
        m.setTitle(req.title());
        m.setType(req.type());
        m.setStatus("UPLOADING");
        String objectKey = "raw/" + id + "/" + req.filename();
        m.setRawObjectKey(objectKey);
        m.setCreatedAt(now);
        m.setUpdatedAt(now);
        mediaRepository.save(m);
        return new InitUploadResponse(id, objectKey);
    }

    @PutMapping(path = "/{mediaId}/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@PathVariable("mediaId") UUID mediaId, @RequestParam("file") MultipartFile file) throws Exception {
        Media m = mediaRepository.findById(mediaId).orElseThrow();
        String key = m.getRawObjectKey();
        try (InputStream in = file.getInputStream()) {
            PutObjectArgs args = PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(in, file.getSize(), -1)
                    .contentType(file.getContentType())
                    .build();
            minioClient.putObject(args);
        }
        return Map.of("objectKey", key, "size", file.getSize());
    }

    public record CompleteUploadRequest(String objectKey) {}

    @PostMapping("/{mediaId}/complete-upload")
    @Transactional
    public Map<String, String> completeUpload(@PathVariable("mediaId") UUID mediaId, @RequestBody CompleteUploadRequest req) {
        Media m = mediaRepository.findById(mediaId).orElseThrow();
        m.setStatus("PROCESSING");
        m.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mediaRepository.save(m);

        MediaUploadedEvent evt = new MediaUploadedEvent(
                mediaId.toString(),
                m.getOwnerId(),
                MediaType.valueOf(m.getType()),
                req.objectKey(),
                req.objectKey().substring(req.objectKey().lastIndexOf('/') + 1),
                "video/mp4",
                java.time.Instant.now()
        );
        kafkaTemplate.send(Topics.MEDIA_UPLOADED, mediaId.toString(), evt);
        return Map.of("status", "PROCESSING");
    }

    @GetMapping("/{mediaId}/status")
    public Map<String, Object> status(@PathVariable("mediaId") UUID mediaId) {
        Media m = mediaRepository.findById(mediaId).orElseThrow();
        var job = jobRepository.findFirstByMediaIdOrderByStartedAtDesc(mediaId);
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("id", m.getId());
        result.put("title", m.getTitle());
        result.put("type", m.getType());
        result.put("status", m.getStatus());

        String message = switch (m.getStatus()) {
            case "READY" -> "Uploaded successfully";
            case "FAILED" -> "Processing failed";
            case "PROCESSING" -> "Processing";
            case "UPLOADING" -> "Uploading";
            default -> m.getStatus();
        };
        result.put("message", message);

        result.put("stage", job.map(j -> j.getStage()).orElse(null));
        result.put("progress", job.map(j -> j.getProgress()).orElse(null));
        result.put("error", job.map(j -> j.getErrorMessage()).orElse(null));
        return result;
    }

    @GetMapping("/{mediaId}/play")
    public Map<String, String> play(@PathVariable("mediaId") UUID mediaId) {
        Media m = mediaRepository.findById(mediaId).orElseThrow();
        String hlsKey = m.getHlsMasterManifestKey();
        if (hlsKey == null) {
            throw new IllegalStateException("Media not ready");
        }
        String url = "http://localhost:9000/" + bucket + "/" + hlsKey;
        return Map.of("hlsUrl", url);
    }
}
