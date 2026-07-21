package com.example.media.api.ops;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.ConsumerGroupListing;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.MemberDescription;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Reads cluster, topic and consumer-group state through the Kafka AdminClient.
 *
 * <p>The dashboard polls this on a short interval, so results are cached
 * briefly and every admin call is bounded by a timeout - an unreachable broker
 * degrades the panel instead of hanging the request thread.
 */
@Service
public class KafkaInsightService {

    private static final Logger log = LoggerFactory.getLogger(KafkaInsightService.class);

    private static final Duration ADMIN_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration CACHE_TTL = Duration.ofMillis(1500);

    /** Only surface the platform's own topics, including their dead letter tails. */
    private static final String TOPIC_PREFIX = "media.";

    private final AdminClient admin;

    private volatile KafkaSnapshot cached;
    private volatile long cachedAtMillis;

    public KafkaInsightService(KafkaAdmin kafkaAdmin) {
        this.admin = AdminClient.create(kafkaAdmin.getConfigurationProperties());
    }

    public KafkaSnapshot snapshot() {
        KafkaSnapshot current = cached;
        if (current != null && System.currentTimeMillis() - cachedAtMillis < CACHE_TTL.toMillis()) {
            return current;
        }
        KafkaSnapshot fresh = capture();
        cached = fresh;
        cachedAtMillis = System.currentTimeMillis();
        return fresh;
    }

    private KafkaSnapshot capture() {
        try {
            DescribeClusterResult cluster = admin.describeCluster();
            String clusterId = await(cluster.clusterId());
            Node controller = await(cluster.controller());
            Collection<Node> nodes = await(cluster.nodes());

            Integer controllerId = controller == null || controller.id() < 0 ? null : controller.id();
            List<KafkaSnapshot.Broker> brokers = nodes.stream()
                    .sorted(Comparator.comparingInt(Node::id))
                    .map(node -> new KafkaSnapshot.Broker(node.id(), node.host(), node.port(),
                            controllerId != null && controllerId == node.id()))
                    .toList();

            List<String> topicNames = await(admin.listTopics().names()).stream()
                    .filter(name -> name.startsWith(TOPIC_PREFIX))
                    .sorted()
                    .toList();

            Map<String, TopicDescription> descriptions =
                    topicNames.isEmpty() ? Map.of() : await(admin.describeTopics(topicNames).allTopicNames());

            List<TopicPartition> allPartitions = descriptions.values().stream()
                    .flatMap(d -> d.partitions().stream()
                            .map(p -> new TopicPartition(d.name(), p.partition())))
                    .toList();

            Map<TopicPartition, Long> endOffsets = listOffsets(allPartitions, OffsetSpec.latest());
            Map<TopicPartition, Long> startOffsets = listOffsets(allPartitions, OffsetSpec.earliest());

            List<KafkaSnapshot.Topic> topics = topicNames.stream()
                    .map(name -> toTopic(descriptions.get(name), startOffsets, endOffsets))
                    .filter(java.util.Objects::nonNull)
                    .toList();

            List<KafkaSnapshot.ConsumerGroup> groups = describeGroups(endOffsets);

            return new KafkaSnapshot(true, null, clusterId, controllerId, brokers, topics, groups, Instant.now());
        } catch (Exception e) {
            log.warn("Kafka insight capture failed: {}", e.toString());
            return new KafkaSnapshot(false, rootMessage(e), null, null,
                    List.of(), List.of(), List.of(), Instant.now());
        }
    }

    private KafkaSnapshot.Topic toTopic(TopicDescription description,
                                        Map<TopicPartition, Long> startOffsets,
                                        Map<TopicPartition, Long> endOffsets) {
        if (description == null) {
            return null;
        }
        List<KafkaSnapshot.Partition> partitions = new ArrayList<>();
        long total = 0L;
        long retained = 0L;

        for (TopicPartitionInfo info : description.partitions()) {
            TopicPartition tp = new TopicPartition(description.name(), info.partition());
            long end = endOffsets.getOrDefault(tp, 0L);
            long start = startOffsets.getOrDefault(tp, 0L);
            KafkaSnapshot.Partition partition = new KafkaSnapshot.Partition(
                    info.partition(),
                    start,
                    end,
                    info.leader() == null ? null : info.leader().id(),
                    info.replicas().size(),
                    info.isr().size());
            partitions.add(partition);
            total += end;
            retained += partition.depth();
        }

        partitions.sort(Comparator.comparingInt(KafkaSnapshot.Partition::partition));
        return new KafkaSnapshot.Topic(description.name(), partitions.size(), total, retained, partitions);
    }

    private List<KafkaSnapshot.ConsumerGroup> describeGroups(Map<TopicPartition, Long> endOffsets) throws Exception {
        List<String> groupIds = await(admin.listConsumerGroups().valid()).stream()
                .map(ConsumerGroupListing::groupId)
                .sorted()
                .toList();

        if (groupIds.isEmpty()) {
            return List.of();
        }

        Map<String, ConsumerGroupDescription> described = await(admin.describeConsumerGroups(groupIds).all());
        List<KafkaSnapshot.ConsumerGroup> result = new ArrayList<>();

        for (String groupId : groupIds) {
            ConsumerGroupDescription description = described.get(groupId);
            if (description == null) {
                continue;
            }

            Map<TopicPartition, OffsetAndMetadata> committed;
            try {
                committed = await(admin.listConsumerGroupOffsets(groupId).partitionsToOffsetAndMetadata());
            } catch (Exception e) {
                log.debug("Could not read offsets for group {}: {}", groupId, e.toString());
                committed = Map.of();
            }

            Map<String, long[]> perTopic = new LinkedHashMap<>();
            for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : committed.entrySet()) {
                TopicPartition tp = entry.getKey();
                if (!tp.topic().startsWith(TOPIC_PREFIX)) {
                    continue;
                }
                long committedOffset = entry.getValue() == null ? 0L : entry.getValue().offset();
                long end = endOffsets.getOrDefault(tp, committedOffset);
                // committed can briefly exceed the cached end offset; clamp at zero.
                long lag = Math.max(0L, end - committedOffset);
                long[] agg = perTopic.computeIfAbsent(tp.topic(), k -> new long[3]);
                agg[0] += committedOffset;
                agg[1] += end;
                agg[2] += lag;
            }

            List<KafkaSnapshot.GroupTopicLag> topicLags = perTopic.entrySet().stream()
                    .map(e -> new KafkaSnapshot.GroupTopicLag(e.getKey(), e.getValue()[0], e.getValue()[1], e.getValue()[2]))
                    .sorted(Comparator.comparing(KafkaSnapshot.GroupTopicLag::topic))
                    .toList();

            long totalLag = topicLags.stream().mapToLong(KafkaSnapshot.GroupTopicLag::lag).sum();

            List<KafkaSnapshot.GroupMember> members = description.members().stream()
                    .map(KafkaInsightService::toMember)
                    .sorted(Comparator.comparing(KafkaSnapshot.GroupMember::clientId))
                    .toList();

            Node coordinator = description.coordinator();
            result.add(new KafkaSnapshot.ConsumerGroup(
                    groupId,
                    description.state().toString(),
                    coordinator == null || coordinator.id() < 0 ? null : coordinator.host() + ":" + coordinator.port(),
                    members.size(),
                    totalLag,
                    members,
                    topicLags));
        }

        return result;
    }

    private static KafkaSnapshot.GroupMember toMember(MemberDescription member) {
        Set<TopicPartition> assignment = member.assignment() == null
                ? Set.of()
                : member.assignment().topicPartitions();
        return new KafkaSnapshot.GroupMember(
                member.consumerId(),
                member.clientId(),
                member.host(),
                assignment.size());
    }

    private Map<TopicPartition, Long> listOffsets(List<TopicPartition> partitions, OffsetSpec spec) throws Exception {
        if (partitions.isEmpty()) {
            return Map.of();
        }
        Map<TopicPartition, OffsetSpec> request = new HashMap<>();
        partitions.forEach(tp -> request.put(tp, spec));

        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> raw = await(admin.listOffsets(request).all());
        return raw.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().offset()));
    }

    private static <T> T await(org.apache.kafka.common.KafkaFuture<T> future) throws Exception {
        return future.get(ADMIN_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
    }

    private static String rootMessage(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        String message = cause.getMessage();
        return message == null || message.isBlank() ? cause.getClass().getSimpleName() : message;
    }

    @PreDestroy
    void close() {
        admin.close(Duration.ofSeconds(2));
    }
}
