package com.example.media.worker.service;

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

    public HlsOutput transcodeToHls(Path input, String mediaId) throws IOException, InterruptedException {
        Path work = Files.createTempDirectory("hls-" + mediaId + "-");
        // 720p and 480p renditions
        Path master = work.resolve("master.m3u8");

        String cmd = String.join(" ",
                "ffmpeg -y -i", shell(input.toString()),
                // 720p
                "-filter:v:0 scale=w=1280:h=720:force_original_aspect_ratio=decrease",
                "-c:a aac -ar 48000 -b:a 128k",
                "-c:v h264 -profile:v main -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 3000k -maxrate 3210k -bufsize 6000k",
                "-hls_time 4 -hls_playlist_type vod",
                "-hls_segment_filename", shell(work.resolve("720p/segment%03d.ts").toString()),
                shell(work.resolve("720p/index.m3u8").toString()),
                // 480p second output
                "-filter:v:1 scale=w=854:h=480:force_original_aspect_ratio=decrease",
                "-map 0:v -map 0:a",
                "-c:a aac -ar 48000 -b:a 96k",
                "-c:v h264 -profile:v main -crf 23 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 1500k -maxrate 1605k -bufsize 3000k",
                "-hls_time 4 -hls_playlist_type vod",
                "-hls_segment_filename", shell(work.resolve("480p/segment%03d.ts").toString()),
                shell(work.resolve("480p/index.m3u8").toString())
        );

        // For simplicity, run separate ffmpeg for each rendition to avoid complex -map combos
        int r720 = runFfmpeg(input, work.resolve("720p"), 1280, 720, 3000, 128);
        int r480 = runFfmpeg(input, work.resolve("480p"), 854, 480, 1500, 96);
        if (r720 != 0 || r480 != 0) throw new RuntimeException("ffmpeg failed");

        // write simple master
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
