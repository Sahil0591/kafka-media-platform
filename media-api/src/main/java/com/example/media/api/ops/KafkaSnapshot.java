package com.example.media.api.ops;

import java.time.Instant;
import java.util.List;

/**
 * Point-in-time view of the Kafka cluster backing the platform, shaped for
 * direct consumption by the ops dashboard.
 *
 * <p>{@code reachable} is false when the broker could not be queried; the
 * remaining collections are then empty and {@code error} carries the reason.
 * The UI renders a degraded state rather than an exception.
 */
public record KafkaSnapshot(
        boolean reachable,
        String error,
        String clusterId,
        Integer controllerId,
        List<Broker> brokers,
        List<Topic> topics,
        List<ConsumerGroup> consumerGroups,
        Instant capturedAt
) {

    public record Broker(int id, String host, int port, boolean controller) {}

    public record Partition(
            int partition,
            long startOffset,
            long endOffset,
            Integer leader,
            int replicas,
            int inSyncReplicas
    ) {
        /** Records currently retained on this partition. */
        public long depth() {
            return Math.max(0L, endOffset - startOffset);
        }
    }

    public record Topic(
            String name,
            int partitionCount,
            long totalRecords,
            long retainedRecords,
            List<Partition> partitions
    ) {}

    public record GroupMember(String memberId, String clientId, String host, int assignedPartitions) {}

    public record GroupTopicLag(String topic, long committedOffset, long endOffset, long lag) {}

    public record ConsumerGroup(
            String groupId,
            String state,
            String coordinator,
            int memberCount,
            long totalLag,
            List<GroupMember> members,
            List<GroupTopicLag> topics
    ) {}
}
