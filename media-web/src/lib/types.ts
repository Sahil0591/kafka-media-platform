/** Wire types mirroring the media-api contract. */

export type MediaType = 'VIDEO' | 'AUDIO'

export type MediaStatusValue = 'UPLOADING' | 'PROCESSING' | 'TRANSCODING' | 'READY' | 'FAILED'

export interface AuthResponse {
  token: string
  username: string
  email: string
}

export interface Profile {
  id: string
  username: string
  email: string
  createdAt: string
}

export interface MediaSummary {
  id: string
  title: string
  type: MediaType
  status: MediaStatusValue
  createdAt: string
  updatedAt: string
}

export interface MediaStatusDetail {
  id: string
  title: string
  type: MediaType
  status: MediaStatusValue
  message: string
  stage: string | null
  progress: number | null
  error: string | null
}

export interface Rendition {
  id: string
  quality: string
  codec: string | null
  bitrateKbps: number | null
  manifestKey: string
}

export interface InitUploadResponse {
  mediaId: string
  objectKey: string
}

/** Normalized SSE payload - see StreamEvent on the API side. */
export interface StreamEvent {
  type: 'progress' | 'processed' | 'failed' | string
  topic: string
  partition: number | null
  offset: number | null
  mediaId: string | null
  status: MediaStatusValue | null
  stage: string | null
  progress: number | null
  message: string | null
  lagMs: number | null
  timestamp: string
}

// ── Observability ───────────────────────────────────────────────────────────

export interface KafkaBroker {
  id: number
  host: string
  port: number
  controller: boolean
}

export interface KafkaPartition {
  partition: number
  startOffset: number
  endOffset: number
  leader: number | null
  replicas: number
  inSyncReplicas: number
}

export interface KafkaTopic {
  name: string
  partitionCount: number
  totalRecords: number
  retainedRecords: number
  partitions: KafkaPartition[]
}

export interface KafkaGroupMember {
  memberId: string
  clientId: string
  host: string
  assignedPartitions: number
}

export interface KafkaGroupTopicLag {
  topic: string
  committedOffset: number
  endOffset: number
  lag: number
}

export interface KafkaConsumerGroup {
  groupId: string
  state: string
  coordinator: string | null
  memberCount: number
  totalLag: number
  members: KafkaGroupMember[]
  topics: KafkaGroupTopicLag[]
}

export interface KafkaSnapshot {
  reachable: boolean
  error: string | null
  clusterId: string | null
  controllerId: number | null
  brokers: KafkaBroker[]
  topics: KafkaTopic[]
  consumerGroups: KafkaConsumerGroup[]
  capturedAt: string
}

export interface PipelineStats {
  byStatus: Record<string, number>
  total: number
  inFlight: number
  renditions: number
  averageProcessingSeconds: number | null
  successRate: number | null
  completionsLast24h: { hour: string; count: number }[]
  capturedAt: string
}
