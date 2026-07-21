package com.example.media.api.web;

import com.example.media.api.stream.LiveEventBroadcaster;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.UUID;

/**
 * Server-sent event endpoints backing the live UI.
 *
 * <p>Browsers cannot attach an Authorization header to an EventSource, so these
 * paths also accept the JWT as an {@code access_token} query parameter - see
 * {@link com.example.media.api.security.JwtAuthenticationFilter}.
 */
@RestController
@RequestMapping("/api/stream")
public class StreamController {

    private final LiveEventBroadcaster broadcaster;

    public StreamController(LiveEventBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    /** Events for the caller's own media only. */
    @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@AuthenticationPrincipal UUID userId) {
        return broadcaster.subscribeOwner(userId);
    }

    /** Anonymized cluster-wide event flow for the ops dashboard. */
    @GetMapping(path = "/firehose", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter firehose() {
        return broadcaster.subscribeFirehose();
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "connectedClients", broadcaster.connectedClients(),
                "eventsPublished", broadcaster.totalEventsPublished());
    }
}
