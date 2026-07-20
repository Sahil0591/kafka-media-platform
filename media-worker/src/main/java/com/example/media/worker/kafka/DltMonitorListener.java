package com.example.media.worker.kafka;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consumes dead-letter topic messages and logs them at ERROR level so they
 * surface in monitoring/alerting systems rather than accumulating silently.
 */
@Component
public class DltMonitorListener {

    private static final Logger log = LoggerFactory.getLogger(DltMonitorListener.class);

    @KafkaListener(topics = "media.uploaded.DLT", groupId = "media-worker-dlt")
    public void onDlt(ConsumerRecord<String, Object> record) {
        log.error("DLT message received - topic={} key={} value={} headers={}",
                record.topic(), record.key(), record.value(), record.headers());
    }
}
