package com.example.media.api.config;

import com.example.media.common.kafka.Topics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    public NewTopic mediaUploadedTopic() {
        return TopicBuilder.name(Topics.MEDIA_UPLOADED)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic mediaTranscodeProgressTopic() {
        return TopicBuilder.name(Topics.MEDIA_TRANSCODE_PROGRESS)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic mediaProcessedTopic() {
        return TopicBuilder.name(Topics.MEDIA_PROCESSED)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic mediaFailedTopic() {
        return TopicBuilder.name(Topics.MEDIA_FAILED)
                .partitions(3)
                .replicas(1)
                .build();
    }
}
