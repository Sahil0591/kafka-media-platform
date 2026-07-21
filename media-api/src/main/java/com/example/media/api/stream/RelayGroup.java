package com.example.media.api.stream;

import java.util.UUID;

/**
 * The relay's Kafka consumer group id, resolved exactly once per JVM.
 *
 * <p>This deliberately does not live in application.yml. Spring's
 * {@code ${random.uuid}} is a dynamic property source: it produces a fresh
 * value on <em>every</em> placeholder resolution, so three
 * {@code @KafkaListener} annotations referencing the same property would each
 * join a different group - three groups per instance instead of one, none of
 * which the cleaner could identify as its own.
 *
 * <p>A static field is evaluated once at class initialization, so every
 * listener and the cleaner all agree on a single id.
 */
public final class RelayGroup {

    /** Shared prefix, used to recognise relay groups for cleanup. */
    public static final String PREFIX = "media-api-live-";

    /**
     * Overridable for deployments that manage group names externally; otherwise
     * a per-process id, which is what fan-out semantics require.
     */
    public static final String ID = resolve();

    private RelayGroup() {
    }

    private static String resolve() {
        String override = System.getenv("APP_STREAM_RELAY_GROUP_ID");
        if (override != null && !override.isBlank()) {
            return override.trim();
        }
        return PREFIX + UUID.randomUUID();
    }
}
