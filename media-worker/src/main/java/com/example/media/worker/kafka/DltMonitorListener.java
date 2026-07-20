package com.example.media.worker.kafka;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consumes dead-letter topic messages and logs them at ERROR level so they
 * surface in monitoring/alerting systems rather than accumulating silently.
 * Uses a dedicated StringDeserializer factory to read any DLT payload
 * regardless of the original message type.
 */
@Component
public class DltMonitorListener {

    private static final Logger log = LoggerFactory.getLogger(DltMonitorListener.class);

    @KafkaListener(topics = "media.uploaded.DLT", groupId = "media-worker-dlt",
            containerFactory = "dltKafkaListenerContainerFactory")
    public void onDlt(ConsumerRecord<String, String> record) {
        log.error("DLT message received - topic={} key={} value={} headers={}",
                record.topic(), record.key(), record.value(), record.headers());
    }
}
