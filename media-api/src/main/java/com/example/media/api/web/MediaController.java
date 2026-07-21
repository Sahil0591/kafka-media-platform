package com.example.media.api.web;

import com.example.media.api.domain.Media;
import com.example.media.api.domain.Rendition;
import com.example.media.api.repo.MediaRepository;
import com.example.media.api.repo.ProcessingJobRepository;
import com.example.media.api.repo.RenditionRepository;
import com.example.media.common.events.MediaUploadedEvent;
import com.example.media.common.kafka.Topics;
import com.example.media.common.model.MediaType;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.Result;
import io.minio.http.Method;
import io.minio.messages.Item;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.net.URLConnection;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/media")
@Validated
public class MediaController {

    private static final Logger log = LoggerFactory.getLogger(MediaController.class);

    private final MediaRepository mediaRepository;
    private final ProcessingJobRepository jobRepository;
    private final RenditionRepository renditionRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final MinioClient minioClient;
    private final String bucket;
    private final String publicBaseUrl;
    /**
     * Browser-reachable MinIO origin. Distinct from app.minio.endpoint, which is
     * the in-network address the API itself uses - inside Docker that resolves to
     * the service name, which no browser can reach.
     */
    private final String minioEndpoint;

    public MediaController(MediaRepository mediaRepository,
                           ProcessingJobRepository jobRepository,
                           RenditionRepository renditionRepository,
                           KafkaTemplate<String, Object> kafkaTemplate,
                           MinioClient minioClient,
                           @Value("${app.minio.bucket}") String bucket,
                           @Value("${app.public-base-url}") String publicBaseUrl,
                           @Value("${app.minio.public-endpoint}") String minioEndpoint) {
        this.mediaRepository = mediaRepository;
        this.jobRepository = jobRepository;
        this.renditionRepository = renditionRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.minioClient = minioClient;
        this.bucket = bucket;
        this.publicBaseUrl = publicBaseUrl;
        this.minioEndpoint = minioEndpoint;
    }

    public record InitUploadRequest(String title, String type, String filename, String contentType) {}
    public record InitUploadResponse(UUID mediaId, String objectKey) {}

    // ── 1. List all my media ──────────────────────────────────────────────────
    @GetMapping
    public List<Map<String, Object>> listMyMedia(@AuthenticationPrincipal UUID userId) {
        return mediaRepository.findByOwnerId(userId).stream()
                .map(m -> {
                    Map<String, Object> item = new java.util.LinkedHashMap<>();
                    item.put("id", m.getId());
                    item.put("title", m.getTitle());
                    item.put("type", m.getType());
                    item.put("status", m.getStatus());
                    item.put("createdAt", m.getCreatedAt());
                    item.put("updatedAt", m.getUpdatedAt());
                    return item;
                })
                .collect(Collectors.toList());
    }

    @PostMapping("/init-upload")
    @Transactional
    public InitUploadResponse initUpload(@AuthenticationPrincipal UUID userId, @RequestBody InitUploadRequest req) {
        if (req.title() == null || req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "title is required");
        }
        if (req.filename() == null || req.filename().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "filename is required");
        }
        try {
            MediaType.valueOf(req.type());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "type must be one of: VIDEO, AUDIO");
        }

        // Sanitize filename: strip path separators and traversal sequences
        String safeFilename = req.filename().replaceAll("[/\\\\]", "_").replaceAll("\\.\\.", "_");
        if (safeFilename.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "filename is invalid after sanitization");
        }

        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        Media m = new Media();
        m.setId(id);
        m.setOwnerId(userId);
        m.setTitle(req.title());
        m.setType(req.type());
        m.setStatus("UPLOADING");
        String objectKey = "raw/" + id + "/" + safeFilename;
        m.setRawObjectKey(objectKey);
        m.setCreatedAt(now);
        m.setUpdatedAt(now);
        mediaRepository.save(m);
        return new InitUploadResponse(id, objectKey);
    }

    @PutMapping(path = "/{mediaId}/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@AuthenticationPrincipal UUID userId, @PathVariable("mediaId") UUID mediaId, @RequestParam("file") MultipartFile file) throws Exception {
        Media m = loadOwnedMedia(userId, mediaId);
        if (!"UPLOADING".equals(m.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Media is in " + m.getStatus() + " state - file upload only allowed in UPLOADING state");
        }
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
    public Map<String, String> completeUpload(@AuthenticationPrincipal UUID userId, @PathVariable("mediaId") UUID mediaId, @RequestBody CompleteUploadRequest req) {
        Media m = loadOwnedMedia(userId, mediaId);
        if (!"UPLOADING".equals(m.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Media is in " + m.getStatus() + " state - only UPLOADING media can be completed");
        }
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

        try {
            kafkaTemplate.send(Topics.MEDIA_UPLOADED, mediaId.toString(), evt).get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.error("Kafka send failed for media {}, rolling back to UPLOADING", mediaId, e);
            m.setStatus("UPLOADING");
            m.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
            mediaRepository.save(m);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Failed to queue processing — please retry");
        }
        return Map.of("status", "PROCESSING");
    }

    // ── 2. Delete media ───────────────────────────────────────────────────────
    @DeleteMapping("/{mediaId}")
    @Transactional
    public Map<String, String> deleteMedia(@AuthenticationPrincipal UUID userId,
                                           @PathVariable("mediaId") UUID mediaId) throws Exception {
        Media m = loadOwnedMedia(userId, mediaId);

        // Remove raw file from MinIO
        if (m.getRawObjectKey() != null) {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket).object(m.getRawObjectKey()).build());
        }

        // Remove all HLS objects (manifests + segments) recursively
        deleteMinioPrefix("hls/" + mediaId + "/");

        // Delete media row — DB cascades to renditions and processing_jobs
        mediaRepository.deleteById(mediaId);
        return Map.of("status", "deleted");
    }

    // ── 3. Update media metadata ──────────────────────────────────────────────
    public record UpdateMetadataRequest(String title) {}

    @PatchMapping("/{mediaId}")
    @Transactional
    public Map<String, Object> updateMetadata(@AuthenticationPrincipal UUID userId,
                                              @PathVariable("mediaId") UUID mediaId,
                                              @RequestBody UpdateMetadataRequest req) {
        Media m = loadOwnedMedia(userId, mediaId);
        if (req.title() != null && !req.title().isBlank()) {
            m.setTitle(req.title());
        }
        m.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mediaRepository.save(m);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("id", m.getId());
        result.put("title", m.getTitle());
        result.put("type", m.getType());
        result.put("status", m.getStatus());
        result.put("updatedAt", m.getUpdatedAt());
        return result;
    }

    // ── 4. Download original file ─────────────────────────────────────────────
    @GetMapping("/{mediaId}/download")
    public Map<String, String> download(@AuthenticationPrincipal UUID userId,
                                        @PathVariable("mediaId") UUID mediaId) throws Exception {
        Media m = loadOwnedMedia(userId, mediaId);
        if (m.getRawObjectKey() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Original file not available");
        }
        String url = minioClient.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs.builder()
                        .method(Method.GET)
                        .bucket(bucket)
                        .object(m.getRawObjectKey())
                        .expiry(1, TimeUnit.HOURS)
                        .build());
        return Map.of("downloadUrl", url);
    }

    // ── 5. View rendition details ─────────────────────────────────────────────
    @GetMapping("/{mediaId}/renditions")
    public List<Map<String, Object>> renditions(@AuthenticationPrincipal UUID userId,
                                                @PathVariable("mediaId") UUID mediaId) {
        loadOwnedMedia(userId, mediaId); // ownership check
        return renditionRepository.findByMediaId(mediaId).stream()
                .map(r -> {
                    Map<String, Object> item = new java.util.LinkedHashMap<>();
                    item.put("id", r.getId());
                    item.put("quality", r.getQuality());
                    item.put("codec", r.getCodec());
                    item.put("bitrateKbps", r.getBitrateKbps());
                    item.put("manifestKey", r.getManifestKey());
                    return item;
                })
                .collect(Collectors.toList());
    }

    private static String inferContentType(Media media, String filename, String requestContentType) {
        if (requestContentType != null && !requestContentType.isBlank()) {
            return requestContentType;
        }
        String guessed = filename == null ? null : URLConnection.guessContentTypeFromName(filename);
        if (guessed != null && !guessed.isBlank()) {
            return guessed;
        }
        if (media != null) {
            String type = media.getType();
            if ("AUDIO".equalsIgnoreCase(type)) return "audio/mpeg";
            if ("VIDEO".equalsIgnoreCase(type)) return "video/mp4";
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
            case "PROCESSING", "TRANSCODING" -> "Processing";
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
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Media is not ready for playback");
        }
        String url = minioEndpoint + "/" + bucket + "/" + hlsKey;
        return Map.of("hlsUrl", url);
    }

    private Media loadOwnedMedia(UUID userId, UUID mediaId) {
        Media m = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!userId.equals(m.getOwnerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return m;
    }

    private void deleteMinioPrefix(String prefix) {
        Iterable<Result<Item>> objects = minioClient.listObjects(
                ListObjectsArgs.builder().bucket(bucket).prefix(prefix).recursive(true).build());
        for (Result<Item> result : objects) {
            try {
                minioClient.removeObject(RemoveObjectArgs.builder()
                        .bucket(bucket).object(result.get().objectName()).build());
            } catch (Exception e) {
                log.warn("Failed to delete MinIO object under prefix '{}': {}", prefix, e.getMessage());
            }
        }
    }
}
