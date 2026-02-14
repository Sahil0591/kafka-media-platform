package com.example.media.worker.service;

import com.example.media.common.model.MediaType;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@Service
public class TranscodeService {
    private final MinioClient minioClient;
    private final String bucket;

    public TranscodeService(MinioClient minioClient, @Value("${app.minio.bucket}") String bucket) {
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    public record HlsOutput(String masterKey, List<String> variantKeys) {}

    /**
     * Transcode input media to HLS. For VIDEO, generate 720p and 480p variants.
     * For AUDIO, generate a single audio-only HLS playlist.
     */
    public HlsOutput transcodeToHls(Path input, String mediaId, MediaType type) throws IOException, InterruptedException {
        if (type == MediaType.AUDIO) {
            return transcodeAudioToHls(input, mediaId);
        }

        Path work = Files.createTempDirectory("hls-" + mediaId + "-");
        Path master = work.resolve("master.m3u8");

        int r720 = runFfmpeg(input, work.resolve("720p"), 1280, 720, 3000, 128);
        int r480 = runFfmpeg(input, work.resolve("480p"), 854, 480, 1500, 96);
        if (r720 != 0 || r480 != 0) throw new RuntimeException("ffmpeg failed");

        String masterContent = "#EXTM3U\n" +
                "#EXT-X-VERSION:3\n" +
                "#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1280x720\n720p/index.m3u8\n" +
                "#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=854x480\n480p/index.m3u8\n";
        Files.writeString(master, masterContent);

        String base = "hls/" + mediaId + "/";
        upload(master.toFile(), base + "master.m3u8");
        uploadDir(work.resolve("720p"), base + "720p/");
        uploadDir(work.resolve("480p"), base + "480p/");

        return new HlsOutput(base + "master.m3u8", List.of(base + "720p/index.m3u8", base + "480p/index.m3u8"));
    }

    private HlsOutput transcodeAudioToHls(Path input, String mediaId) throws IOException, InterruptedException {
        Path work = Files.createTempDirectory("hls-audio-" + mediaId + "-");
        Path master = work.resolve("master.m3u8");
        Path audioDir = work.resolve("audio");

        int r = runFfmpegAudio(input, audioDir, 192);
        if (r != 0) throw new RuntimeException("ffmpeg (audio) failed");

        String masterContent = "#EXTM3U\n" +
                "#EXT-X-VERSION:3\n" +
                "#EXT-X-STREAM-INF:BANDWIDTH=256000\n" +
                "audio/index.m3u8\n";
        Files.writeString(master, masterContent);

        String base = "hls/" + mediaId + "/";
        upload(master.toFile(), base + "master.m3u8");
        uploadDir(audioDir, base + "audio/");

        return new HlsOutput(base + "master.m3u8", List.of(base + "audio/index.m3u8"));
    }

    private int runFfmpeg(Path input, Path outDir, int w, int h, int videoKbps, int audioKbps) throws IOException, InterruptedException {
        Files.createDirectories(outDir);
        String[] cmd = {
                "bash", "-lc",
                String.join(" ",
                        "ffmpeg -y -i", shell(input.toString()),
                        // --- FIX: Add pad filter to ensure even dimensions ---
                        "-vf", shell("scale=w=" + w + ":h=" + h + ":force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"),
                        // ----------------------------------------------------
                        "-c:v h264 -preset veryfast -crf 22 -b:v " + videoKbps + "k",
                        "-c:a aac -b:a " + audioKbps + "k",
                        "-hls_time 4 -hls_playlist_type vod",
                        "-hls_segment_filename", shell(outDir.resolve("segment%03d.ts").toString()),
                        shell(outDir.resolve("index.m3u8").toString())
                )
        };
        Process p = new ProcessBuilder(cmd).inheritIO().start();
        return p.waitFor();
    }

    private int runFfmpegAudio(Path input, Path outDir, int audioKbps) throws IOException, InterruptedException {
        Files.createDirectories(outDir);
        String[] cmd = {
                "bash", "-lc",
                String.join(" ",
                        "ffmpeg -y -i", shell(input.toString()),
                        "-vn", // no video, audio only
                        "-c:a aac -b:a " + audioKbps + "k",
                        "-hls_time 4 -hls_playlist_type vod",
                        "-hls_segment_filename", shell(outDir.resolve("segment%03d.ts").toString()),
                        shell(outDir.resolve("index.m3u8").toString())
                )
        };
        Process p = new ProcessBuilder(cmd).inheritIO().start();
        return p.waitFor();
    }

    private void uploadDir(Path dir, String baseKey) throws IOException {
        Files.list(dir).forEach(path -> {
            try {
                upload(path.toFile(), baseKey + path.getFileName());
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    private void upload(File file, String key) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(in, file.length(), -1)
                    .contentType(contentTypeFor(key))
                    .build());
        } catch (Exception e) {
            throw new IOException("MinIO upload failed for key: " + key, e);
        }
    }

    private static String contentTypeFor(String key) {
        if (key.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
        if (key.endsWith(".ts")) return "video/mp2t";
        return "application/octet-stream";
    }

    private static String shell(String s) { return '"' + s.replace("\"", "\\\"") + '"'; }
}
