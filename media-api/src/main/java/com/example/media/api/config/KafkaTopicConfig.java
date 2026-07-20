package com.example.media.api.config;

import com.example.media.common.kafka.Topics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Value("${app.kafka.topic.partitions:3}")
    private int partitions;

    // Default 1 for local dev; override to 3 in production profile
    @Value("${app.kafka.topic.replicas:1}")
    private int replicas;

    @Value("${app.kafka.topic.min-insync-replicas:#{null}}")
    private String minInsyncReplicas;

    private NewTopic buildTopic(String name) {
        TopicBuilder builder = TopicBuilder.name(name)
                .partitions(partitions)
                .replicas(replicas);
        if (minInsyncReplicas != null && !minInsyncReplicas.isBlank()) {
            builder.config("min.insync.replicas", minInsyncReplicas);
        }
        return builder.build();
    }

    @Bean
    public NewTopic mediaUploadedTopic() {
        return buildTopic(Topics.MEDIA_UPLOADED);
    }

    @Bean
    public NewTopic mediaTranscodeProgressTopic() {
        return buildTopic(Topics.MEDIA_TRANSCODE_PROGRESS);
    }

    @Bean
    public NewTopic mediaProcessedTopic() {
        return buildTopic(Topics.MEDIA_PROCESSED);
    }

    @Bean
    public NewTopic mediaFailedTopic() {
        return buildTopic(Topics.MEDIA_FAILED);
    }
}
