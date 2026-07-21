package com.example.media.api.stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory fan-out from Kafka consumers to connected browsers.
 *
 * <p>Two channels are served:
 * <ul>
 *   <li><b>owner channel</b> - events for a single user's media, keyed by user id.</li>
 *   <li><b>firehose channel</b> - anonymized cluster-wide flow used by the ops dashboard.</li>
 * </ul>
 *
 * <p>Delivery is intentionally best-effort. A browser that cannot keep up is
 * dropped rather than allowed to block the Kafka listener thread.
 */
@Component
public class LiveEventBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(LiveEventBroadcaster.class);

    /** Emitters live for an hour, then the browser reconnects. */
    private static final long EMITTER_TIMEOUT_MS = 60 * 60 * 1000L;

    /** Replay buffer handed to a client the moment it connects. */
    private static final int REPLAY_CAPACITY = 60;

    private final Map<UUID, Set<SseEmitter>> ownerChannels = new ConcurrentHashMap<>();
    private final Set<SseEmitter> firehoseChannel = ConcurrentHashMap.newKeySet();
    private final Deque<StreamEvent> replayBuffer = new ArrayDeque<>(REPLAY_CAPACITY);

    private final AtomicLong eventsPublished = new AtomicLong();

    // ── subscription ──────────────────────────────────────────────────────────

    public SseEmitter subscribeOwner(UUID userId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        Set<SseEmitter> channel = ownerChannels.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet());
        channel.add(emitter);
        bindLifecycle(emitter, () -> {
            channel.remove(emitter);
            ownerChannels.computeIfPresent(userId, (k, v) -> v.isEmpty() ? null : v);
        });
        sendHandshake(emitter, "owner");
        return emitter;
    }

    public SseEmitter subscribeFirehose() {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        firehoseChannel.add(emitter);
        bindLifecycle(emitter, () -> firehoseChannel.remove(emitter));
        sendHandshake(emitter, "firehose");
        replaySnapshot().forEach(event -> deliver(emitter, "replay", event.anonymized()));
        return emitter;
    }

    // ── publication ───────────────────────────────────────────────────────────

    /**
     * Fans an event out to its owner and to the anonymized firehose.
     *
     * @param ownerId owner of the media, or null when the owner could not be resolved
     */
    public void publish(UUID ownerId, StreamEvent event) {
        eventsPublished.incrementAndGet();
        remember(event);

        if (ownerId != null) {
            Set<SseEmitter> channel = ownerChannels.get(ownerId);
            if (channel != null) {
                channel.forEach(emitter -> deliver(emitter, event.type(), event));
            }
        }

        if (!firehoseChannel.isEmpty()) {
            StreamEvent scrubbed = event.anonymized();
            firehoseChannel.forEach(emitter -> deliver(emitter, event.type(), scrubbed));
        }
    }

    // ── introspection ─────────────────────────────────────────────────────────

    public long totalEventsPublished() {
        return eventsPublished.get();
    }

    public int connectedClients() {
        int owners = ownerChannels.values().stream().mapToInt(Set::size).sum();
        return owners + firehoseChannel.size();
    }

    public List<StreamEvent> replaySnapshot() {
        synchronized (replayBuffer) {
            return new ArrayList<>(replayBuffer);
        }
    }

    // ── internals ─────────────────────────────────────────────────────────────

    /** Keeps proxies and load balancers from reaping idle SSE connections. */
    @Scheduled(fixedRate = 20_000L)
    void heartbeat() {
        if (ownerChannels.isEmpty() && firehoseChannel.isEmpty()) {
            return;
        }
        Map<String, Object> beat = Map.of("at", System.currentTimeMillis(),
                "clients", connectedClients());
        ownerChannels.values().forEach(channel ->
                channel.forEach(emitter -> deliver(emitter, "heartbeat", beat)));
        firehoseChannel.forEach(emitter -> deliver(emitter, "heartbeat", beat));
    }

    private void remember(StreamEvent event) {
        synchronized (replayBuffer) {
            if (replayBuffer.size() >= REPLAY_CAPACITY) {
                replayBuffer.removeFirst();
            }
            replayBuffer.addLast(event);
        }
    }

    private void bindLifecycle(SseEmitter emitter, Runnable unregister) {
        emitter.onCompletion(unregister);
        emitter.onTimeout(() -> {
            unregister.run();
            emitter.complete();
        });
        emitter.onError(e -> unregister.run());
    }

    private void sendHandshake(SseEmitter emitter, String channel) {
        deliver(emitter, "connected", Map.of(
                "channel", channel,
                "at", System.currentTimeMillis()));
    }

    private void deliver(SseEmitter emitter, String name, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(name).data(payload));
        } catch (IOException | IllegalStateException e) {
            // Client vanished mid-write. Completing triggers the lifecycle hook
            // that removes it from its channel.
            log.debug("Dropping SSE client on '{}': {}", name, e.getClass().getSimpleName());
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // Already completed by the container.
            }
        }
    }
}
