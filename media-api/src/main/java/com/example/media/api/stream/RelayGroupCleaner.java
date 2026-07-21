package com.example.media.api.stream;

import jakarta.annotation.PreDestroy;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ConsumerGroupListing;
import org.apache.kafka.common.ConsumerGroupState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Keeps the relay's throwaway consumer groups from piling up on the broker.
 *
 * <p>{@link LiveEventRelay} deliberately runs in a per-instance group so every
 * API process receives every record. The cost is that each restart abandons its
 * previous group, and Kafka retains those for {@code offsets.retention.minutes}
 * - seven days by default. Left alone they accumulate and swamp the consumer
 * group view with dead entries.
 *
 * <p>Two sweeps handle it: this instance deletes its own group on graceful
 * shutdown, and on startup it removes any <em>empty</em> group sharing the relay
 * prefix. The empty check is what makes the startup sweep safe - a group with
 * live members belongs to another running instance and is never touched.
 */
@Component
public class RelayGroupCleaner {

    private static final Logger log = LoggerFactory.getLogger(RelayGroupCleaner.class);

    private static final Duration ADMIN_TIMEOUT = Duration.ofSeconds(5);

    private final KafkaAdmin kafkaAdmin;

    public RelayGroupCleaner(KafkaAdmin kafkaAdmin) {
        this.kafkaAdmin = kafkaAdmin;
    }

    /** Clears groups orphaned by earlier runs that did not shut down cleanly. */
    @EventListener(ApplicationReadyEvent.class)
    void sweepAbandonedGroups() {
        try (AdminClient admin = AdminClient.create(kafkaAdmin.getConfigurationProperties())) {
            List<String> abandoned = admin.listConsumerGroups().valid()
                    .get(ADMIN_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).stream()
                    .filter(listing -> listing.groupId().startsWith(RelayGroup.PREFIX))
                    .filter(listing -> !listing.groupId().equals(RelayGroup.ID))
                    // EMPTY means the group exists but has no live member, so no
                    // other instance is relying on it.
                    .filter(listing -> listing.state().orElse(ConsumerGroupState.UNKNOWN) == ConsumerGroupState.EMPTY)
                    .map(ConsumerGroupListing::groupId)
                    .toList();

            if (abandoned.isEmpty()) {
                return;
            }

            admin.deleteConsumerGroups(abandoned).all().get(ADMIN_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            log.info("Removed {} abandoned relay consumer group(s)", abandoned.size());
        } catch (Exception e) {
            // Housekeeping only - never block startup over it.
            log.warn("Could not sweep abandoned relay groups: {}", e.toString());
        }
    }

    /** Removes this instance's own group so a clean shutdown leaves nothing behind. */
    @PreDestroy
    void removeOwnGroup() {
        try (AdminClient admin = AdminClient.create(kafkaAdmin.getConfigurationProperties())) {
            admin.deleteConsumerGroups(List.of(RelayGroup.ID))
                    .all().get(ADMIN_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            log.info("Removed relay consumer group {}", RelayGroup.ID);
        } catch (Exception e) {
            log.debug("Could not remove relay group {} on shutdown: {}", RelayGroup.ID, e.toString());
        }
    }
}
