package com.example.media.worker.service;

import com.example.media.common.model.MediaType;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.IntConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class TranscodeService {

    private static final Logger log = LoggerFactory.getLogger(TranscodeService.class);
    private static final Pattern TIME_PATTERN = Pattern.compile("time=(\\d{2}):(\\d{2}):(\\d{2})\\.(\\d{2})");
    private static final long FFMPEG_TIMEOUT_MINUTES = 25;
    private static final long PROBE_TIMEOUT_SECONDS = 30;

    private final MinioClient minioClient;
    private final String bucket;

    public TranscodeService(MinioClient minioClient, @Value("${app.minio.bucket}") String bucket) {
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    public record HlsOutput(String masterKey, List<String> variantKeys, int durationSeconds) {}

    @FunctionalInterface
    public interface ProgressCallback {
        void onProgress(int percent, String stage);
    }

    public HlsOutput transcodeToHls(Path input, String mediaId, MediaType type, ProgressCallback progress)
            throws IOException, InterruptedException {
        if (type == MediaType.AUDIO) {
            return transcodeAudioToHls(input, mediaId, progress);
        }

        Path work = Files.createTempDirectory("hls-" + mediaId + "-");
        try {
            Path master = work.resolve("master.m3u8");

            // Probe duration for progress calculation
            int duration = probeDuration(input);

            progress.onProgress(0, "Transcoding 720p");
            int r720 = runFfmpeg(input, work.resolve("720p"), 1280, 720, 3000, 128, duration,
                    pct -> progress.onProgress(pct / 2, "Transcoding 720p"));

            progress.onProgress(50, "Transcoding 480p");
            int r480 = runFfmpeg(input, work.resolve("480p"), 854, 480, 1500, 96, duration,
                    pct -> progress.onProgress(50 + pct / 2, "Transcoding 480p"));

            if (r720 != 0 || r480 != 0) throw new RuntimeException("ffmpeg failed");

            String masterContent = "#EXTM3U\n" +
                    "#EXT-X-VERSION:3\n" +
                    "#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1280x720\n720p/index.m3u8\n" +
                    "#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=854x480\n480p/index.m3u8\n";
            Files.writeString(master, masterContent);

            String base = "hls/" + mediaId + "/";
            progress.onProgress(95, "Uploading to storage");
            upload(master.toFile(), base + "master.m3u8");
            uploadDir(work.resolve("720p"), base + "720p/");
            uploadDir(work.resolve("480p"), base + "480p/");

            return new HlsOutput(base + "master.m3u8",
                    List.of(base + "720p/index.m3u8", base + "480p/index.m3u8"),
                    duration);
        } finally {
            deleteDirectory(work);
        }
    }

    // Overload without progress callback for backward compatibility
    public HlsOutput transcodeToHls(Path input, String mediaId, MediaType type)
            throws IOException, InterruptedException {
        return transcodeToHls(input, mediaId, type, (pct, stage) -> {});
    }

    private HlsOutput transcodeAudioToHls(Path input, String mediaId, ProgressCallback progress)
            throws IOException, InterruptedException {
        Path work = Files.createTempDirectory("hls-audio-" + mediaId + "-");
        try {
            Path master = work.resolve("master.m3u8");
            Path audioDir = work.resolve("audio");

            int duration = probeDuration(input);

            progress.onProgress(0, "Transcoding audio");
            int r = runFfmpegAudio(input, audioDir, 192, duration,
                    pct -> progress.onProgress(pct, "Transcoding audio"));
            if (r != 0) throw new RuntimeException("ffmpeg (audio) failed");

            String masterContent = "#EXTM3U\n" +
                    "#EXT-X-VERSION:3\n" +
                    "#EXT-X-STREAM-INF:BANDWIDTH=256000\n" +
                    "audio/index.m3u8\n";
            Files.writeString(master, masterContent);

            String base = "hls/" + mediaId + "/";
            progress.onProgress(95, "Uploading to storage");
            upload(master.toFile(), base + "master.m3u8");
            uploadDir(audioDir, base + "audio/");

            return new HlsOutput(base + "master.m3u8", List.of(base + "audio/index.m3u8"), duration);
        } finally {
            deleteDirectory(work);
        }
    }

    private int probeDuration(Path input) {
        try {
            String[] cmd = {"bash", "-lc",
                    "ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 " + shell(input.toString())};
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            String output = new String(p.getInputStream().readAllBytes()).trim();
            if (!p.waitFor(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                log.warn("ffprobe timed out after {}s, destroying process", PROBE_TIMEOUT_SECONDS);
                p.destroyForcibly();
                return 0;
            }
            return (int) Double.parseDouble(output);
        } catch (Exception e) {
            log.warn("Could not probe duration, progress will be approximate: {}", e.getMessage());
            return 0;
        }
    }

    private int runFfmpeg(Path input, Path outDir, int w, int h, int videoKbps, int audioKbps,
                          int totalDuration, IntConsumer progressPct) throws IOException, InterruptedException {
        Files.createDirectories(outDir);
        String[] cmd = {
                "bash", "-lc",
                String.join(" ",
                        "ffmpeg -y -progress pipe:2 -i", shell(input.toString()),
                        "-vf", shell("scale=w=" + w + ":h=" + h + ":force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"),
                        "-c:v h264 -preset veryfast -crf 22 -b:v " + videoKbps + "k",
                        "-c:a aac -b:a " + audioKbps + "k",
                        "-hls_time 4 -hls_playlist_type vod",
                        "-hls_segment_filename", shell(outDir.resolve("segment%03d.ts").toString()),
                        shell(outDir.resolve("index.m3u8").toString())
                )
        };
        return runWithWatchdog(cmd, totalDuration, progressPct);
    }

    private int runFfmpegAudio(Path input, Path outDir, int audioKbps,
                               int totalDuration, IntConsumer progressPct) throws IOException, InterruptedException {
        Files.createDirectories(outDir);
        String[] cmd = {
                "bash", "-lc",
                String.join(" ",
                        "ffmpeg -y -progress pipe:2 -i", shell(input.toString()),
                        "-vn",
                        "-c:a aac -b:a " + audioKbps + "k",
                        "-hls_time 4 -hls_playlist_type vod",
                        "-hls_segment_filename", shell(outDir.resolve("segment%03d.ts").toString()),
                        shell(outDir.resolve("index.m3u8").toString())
                )
        };
        return runWithWatchdog(cmd, totalDuration, progressPct);
    }

    /**
     * Starts an ffmpeg process with a watchdog that kills it after FFMPEG_TIMEOUT_MINUTES.
     * The watchdog runs on a scheduled thread so that even if parseProgress blocks on
     * readLine() (hung ffmpeg), the process is killed and the stream is closed, unblocking
     * the caller.
     */
    private int runWithWatchdog(String[] cmd, int totalDuration, IntConsumer progressPct)
            throws IOException, InterruptedException {
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "ffmpeg-watchdog");
            t.setDaemon(true);
            return t;
        });
        ScheduledFuture<?> killTask = watchdog.schedule(() -> {
            log.error("ffmpeg timed out after {} minutes, destroying process", FFMPEG_TIMEOUT_MINUTES);
            p.destroyForcibly();
        }, FFMPEG_TIMEOUT_MINUTES, TimeUnit.MINUTES);
        try {
            parseProgress(p, totalDuration, progressPct);
            p.waitFor();
        } finally {
            killTask.cancel(false);
            watchdog.shutdownNow();
        }
        if (!p.isAlive() && p.exitValue() == 137) {
            throw new RuntimeException("ffmpeg timed out after " + FFMPEG_TIMEOUT_MINUTES + " minutes");
        }
        return p.exitValue();
    }

    private void parseProgress(Process p, int totalDuration, IntConsumer progressPct) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (totalDuration <= 0) continue;
                Matcher m = TIME_PATTERN.matcher(line);
                if (m.find()) {
                    int seconds = Integer.parseInt(m.group(1)) * 3600
                            + Integer.parseInt(m.group(2)) * 60
                            + Integer.parseInt(m.group(3));
                    int pct = Math.min(100, (int) ((seconds * 100L) / totalDuration));
                    progressPct.accept(pct);
                }
            }
        } catch (IOException e) {
            log.warn("Error reading ffmpeg output: {}", e.getMessage());
        }
    }

    private void uploadDir(Path dir, String baseKey) throws IOException {
        try (var entries = Files.list(dir)) {
            entries.forEach(path -> {
                try {
                    upload(path.toFile(), baseKey + path.getFileName());
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
        }
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

    private static void deleteDirectory(Path dir) {
        try {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.deleteIfExists(file);
                    return FileVisitResult.CONTINUE;
                }
                @Override
                public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                    Files.deleteIfExists(d);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {}
    }
}
