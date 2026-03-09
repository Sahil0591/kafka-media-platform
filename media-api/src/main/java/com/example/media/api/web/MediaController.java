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
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.net.URLConnection;
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
    public InitUploadResponse initUpload(@AuthenticationPrincipal UUID userId, @RequestBody InitUploadRequest req) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        Media m = new Media();
        m.setId(id);
        m.setOwnerId(userId);
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
    public Map<String, Object> upload(@AuthenticationPrincipal UUID userId, @PathVariable("mediaId") UUID mediaId, @RequestParam("file") MultipartFile file) throws Exception {
        Media m = loadOwnedMedia(userId, mediaId);
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

    public record CompleteUploadRequest(String objectKey, String contentType) {}

    @PostMapping("/{mediaId}/complete-upload")
    @Transactional
    public Map<String, String> completeUpload(@AuthenticationPrincipal UUID userId, @PathVariable("mediaId") UUID mediaId, @RequestBody CompleteUploadRequest req) {
        Media m = loadOwnedMedia(userId, mediaId);
        String storedKey = m.getRawObjectKey();
        if (storedKey == null || storedKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Upload not initialized");
        }
        if (req != null && req.objectKey() != null && !req.objectKey().equals(storedKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "objectKey mismatch");
        }

        m.setStatus("PROCESSING");
        m.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mediaRepository.save(m);

        String filename = storedKey.substring(storedKey.lastIndexOf('/') + 1);
        String contentType = inferContentType(m, filename, req == null ? null : req.contentType());

        MediaUploadedEvent evt = new MediaUploadedEvent(
                mediaId.toString(),
                m.getOwnerId().toString(),
                MediaType.valueOf(m.getType()),
                storedKey,
                filename,
                contentType,
                java.time.Instant.now()
        );
        kafkaTemplate.send(Topics.MEDIA_UPLOADED, mediaId.toString(), evt);
        return Map.of("status", "PROCESSING");
    }

    private static String inferContentType(Media media, String filename, String requestContentType) {
        if (requestContentType != null && !requestContentType.isBlank()) {
            return requestContentType;
        }

        String guessed = filename == null ? null : URLConnection.guessContentTypeFromName(filename);
        if (guessed != null && !guessed.isBlank()) {
            return guessed;
        }

        // Conservative defaults if we can't infer reliably.
        if (media != null) {
            String type = media.getType();
            if ("AUDIO".equalsIgnoreCase(type)) {
                return "audio/mpeg";
            }
            if ("VIDEO".equalsIgnoreCase(type)) {
                return "video/mp4";
            }
        }
        return "application/octet-stream";
    }

    @GetMapping("/{mediaId}/status")
    public Map<String, Object> status(@AuthenticationPrincipal UUID userId, @PathVariable("mediaId") UUID mediaId) {
        Media m = loadOwnedMedia(userId, mediaId);
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
    public Map<String, String> play(@AuthenticationPrincipal UUID userId, @PathVariable("mediaId") UUID mediaId) {
        Media m = loadOwnedMedia(userId, mediaId);
        String hlsKey = m.getHlsMasterManifestKey();
        if (hlsKey == null) {
            throw new IllegalStateException("Media not ready");
        }
        String url = "http://localhost:9000/" + bucket + "/" + hlsKey;
        return Map.of("hlsUrl", url);
    }

    private Media loadOwnedMedia(UUID userId, UUID mediaId) {
        Media m = mediaRepository.findById(mediaId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!userId.equals(m.getOwnerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return m;
    }
}
