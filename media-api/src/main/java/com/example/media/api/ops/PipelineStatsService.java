package com.example.media.api.ops;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Pipeline throughput figures for the caller's own library, read straight from
 * Postgres. Complements {@link KafkaInsightService}: one answers "what is the
 * bus doing", this one answers "what did it produce".
 */
@Service
public class PipelineStatsService {

    private static final List<String> STATUSES =
            List.of("UPLOADING", "PROCESSING", "TRANSCODING", "READY", "FAILED");

    private final JdbcTemplate jdbc;

    public PipelineStatsService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Stats(
            Map<String, Long> byStatus,
            long total,
            long inFlight,
            long renditions,
            Double averageProcessingSeconds,
            Double successRate,
            List<Bucket> completionsLast24h,
            Instant capturedAt
    ) {}

    public record Bucket(String hour, long count) {}

    public Stats forOwner(UUID ownerId) {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        STATUSES.forEach(status -> byStatus.put(status, 0L));

        jdbc.query("SELECT status, count(*) AS c FROM media WHERE owner_id = ? GROUP BY status",
                rs -> {
                    byStatus.merge(rs.getString("status"), rs.getLong("c"), Long::sum);
                },
                ownerId);

        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();
        long inFlight = byStatus.getOrDefault("UPLOADING", 0L)
                + byStatus.getOrDefault("PROCESSING", 0L)
                + byStatus.getOrDefault("TRANSCODING", 0L);
        long ready = byStatus.getOrDefault("READY", 0L);
        long failed = byStatus.getOrDefault("FAILED", 0L);

        Long renditions = jdbc.queryForObject(
                "SELECT count(*) FROM renditions r JOIN media m ON m.id = r.media_id WHERE m.owner_id = ?",
                Long.class, ownerId);

        Double avgSeconds = jdbc.queryForObject(
                "SELECT avg(EXTRACT(EPOCH FROM (j.ended_at - j.started_at))) " +
                        "FROM processing_jobs j JOIN media m ON m.id = j.media_id " +
                        "WHERE m.owner_id = ? AND j.ended_at IS NOT NULL",
                Double.class, ownerId);

        List<Bucket> completions = jdbc.query(
                "SELECT to_char(date_trunc('hour', m.updated_at), 'YYYY-MM-DD\"T\"HH24:00') AS hour, " +
                        "count(*) AS c FROM media m " +
                        "WHERE m.owner_id = ? AND m.status = 'READY' " +
                        "AND m.updated_at > now() - interval '24 hours' " +
                        "GROUP BY 1 ORDER BY 1",
                (rs, i) -> new Bucket(rs.getString("hour"), rs.getLong("c")),
                ownerId);

        long settled = ready + failed;
        Double successRate = settled == 0 ? null : (double) ready / settled;

        return new Stats(byStatus, total, inFlight,
                renditions == null ? 0L : renditions,
                avgSeconds, successRate, completions, Instant.now());
    }
}
