package com.example.media.api.web;

import com.example.media.api.ops.KafkaInsightService;
import com.example.media.api.ops.KafkaSnapshot;
import com.example.media.api.ops.PipelineStatsService;
import com.example.media.api.stream.LiveEventBroadcaster;
import com.example.media.api.stream.StreamEvent;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Observability surface for the ops dashboard: Kafka cluster state, pipeline
 * throughput, and the buffered tail of the live event stream.
 */
@RestController
@RequestMapping("/api/ops")
public class OpsController {

    private final KafkaInsightService kafkaInsight;
    private final PipelineStatsService pipelineStats;
    private final LiveEventBroadcaster broadcaster;

    public OpsController(KafkaInsightService kafkaInsight,
                         PipelineStatsService pipelineStats,
                         LiveEventBroadcaster broadcaster) {
        this.kafkaInsight = kafkaInsight;
        this.pipelineStats = pipelineStats;
        this.broadcaster = broadcaster;
    }

    @GetMapping("/kafka")
    public KafkaSnapshot kafka() {
        return kafkaInsight.snapshot();
    }

    @GetMapping("/pipeline")
    public PipelineStatsService.Stats pipeline(@AuthenticationPrincipal UUID userId) {
        return pipelineStats.forOwner(userId);
    }

    /** Recent events, anonymized - lets a freshly loaded dashboard show history immediately. */
    @GetMapping("/recent-events")
    public List<StreamEvent> recentEvents() {
        return broadcaster.replaySnapshot().stream()
                .map(StreamEvent::anonymized)
                .toList();
    }
}
