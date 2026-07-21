import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Server } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { BarRow } from '@/components/charts/BarRow'
import { Sparkline, type Point } from '@/components/charts/Sparkline'
import { ConsumerGroupCard } from '@/components/ops/ConsumerGroupCard'
import { EventFeed } from '@/components/ops/EventFeed'
import { StatTile } from '@/components/ops/StatTile'
import { Panel, PanelLabel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { compactNumber, duration } from '@/lib/format'
import { useFirehose } from '@/hooks/useFirehose'
import { usePolling } from '@/hooks/usePolling'
import { cn } from '@/lib/cn'
import type { KafkaSnapshot } from '@/lib/types'

const KAFKA_INTERVAL_MS = 3000
const PIPELINE_INTERVAL_MS = 12000
const THROUGHPUT_WINDOW = 40

export default function Pulse() {
  const kafka = usePolling<KafkaSnapshot>(() => api.ops.kafka(), KAFKA_INTERVAL_MS)
  const pipeline = usePolling(() => api.ops.pipeline(), PIPELINE_INTERVAL_MS)
  const { events, connected } = useFirehose()

  const throughput = useThroughput(kafka.data)

  if (kafka.loading && !kafka.data) return <PulseSkeleton />

  const snapshot = kafka.data
  const stats = pipeline.data

  const totalLag = snapshot?.consumerGroups.reduce((sum, group) => sum + group.totalLag, 0) ?? 0
  const totalRecords = snapshot?.topics.reduce((sum, topic) => sum + topic.totalRecords, 0) ?? 0
  const maxTopicRecords = Math.max(...(snapshot?.topics.map((t) => t.totalRecords) ?? [0]), 1)
  const eventsPerMin = throughput.length ? throughput[throughput.length - 1].v : 0

  return (
    <Page wide className="space-y-7">
      <PageHeader
        eyebrow="Observability"
        title="Pulse"
        description="What the event bus is doing right now: consumer group health, partition depth, and the live tail of every topic."
        actions={<ClusterBadge snapshot={snapshot} />}
      />

      {snapshot && !snapshot.reachable && (
        <Panel className="border-warn/25 bg-warn/[0.06]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-warn mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-white/85">Cluster unreachable</p>
              <p className="mt-1 font-mono text-[11.5px] text-white/45">{snapshot.error}</p>
            </div>
          </div>
        </Panel>
      )}

      {/* A refetch dims the existing render rather than collapsing to skeletons */}
      <div
        className={cn(
          'space-y-7 transition-opacity duration-300',
          kafka.refreshing && !kafka.loading && 'opacity-[0.82]',
        )}
      >
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Throughput"
            value={eventsPerMin.toFixed(eventsPerMin >= 10 ? 0 : 1)}
            unit="events/min"
            detail={`${compactNumber(totalRecords)} produced all time`}
          >
            <Sparkline points={throughput} format={(v) => `${v.toFixed(1)}/min`} />
          </StatTile>

          <StatTile
            label="Consumer lag"
            value={compactNumber(totalLag)}
            unit="records"
            tone={totalLag > 100 ? 'warn' : 'default'}
            detail={`across ${snapshot?.consumerGroups.length ?? 0} groups`}
          />

          <StatTile
            label="In flight"
            value={String(stats?.inFlight ?? 0)}
            unit={stats?.inFlight === 1 ? 'title' : 'titles'}
            detail={`${stats?.total ?? 0} in your library`}
          />

          <StatTile
            label="Success rate"
            value={stats?.successRate != null ? `${Math.round(stats.successRate * 100)}%` : '-'}
            tone={stats?.successRate != null && stats.successRate < 0.9 ? 'warn' : 'good'}
            detail={
              stats?.averageProcessingSeconds != null
                ? `mean ${duration(stats.averageProcessingSeconds)} per title`
                : 'no completed jobs yet'
            }
          />
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <div>
              <h2 className="mb-4 text-[1.05rem] font-semibold text-white/85">Consumer groups</h2>
              {snapshot && snapshot.consumerGroups.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {snapshot.consumerGroups.map((group) => (
                    <ConsumerGroupCard key={group.groupId} group={group} />
                  ))}
                </div>
              ) : (
                <Panel>
                  <p className="text-[12.5px] text-white/35">
                    No consumer groups reported. Start media-api and media-worker to populate this.
                  </p>
                </Panel>
              )}
            </div>

            <TopicsPanel snapshot={snapshot} max={maxTopicRecords} />
          </div>

          {/* Sticky so the live tail stays in view while the topic list scrolls */}
          <div className="xl:sticky xl:top-24">
            <EventFeed events={events} connected={connected} />
          </div>
        </section>
      </div>
    </Page>
  )
}

function TopicsPanel({ snapshot, max }: { snapshot: KafkaSnapshot | null; max: number }) {
  return (
    <Panel>
      <PanelLabel>Topics</PanelLabel>
      <p className="mt-1.5 text-[11.5px] text-white/30">
        Records produced per topic, with per-partition depth underneath.
      </p>

      <div className="mt-5 space-y-5">
        {(snapshot?.topics.length ?? 0) === 0 ? (
          <p className="text-[12.5px] text-white/35">No platform topics found on the cluster.</p>
        ) : (
          snapshot?.topics.map((topic) => (
            <div key={topic.name}>
              <BarRow
                label={topic.name}
                value={topic.totalRecords}
                max={max}
                format={compactNumber}
                hint={`${topic.partitionCount} partitions - ${compactNumber(topic.retainedRecords)} retained`}
              />

              <div className="mt-2 flex flex-wrap gap-1.5">
                {topic.partitions.map((partition) => (
                  <span
                    key={partition.partition}
                    title={`partition ${partition.partition}: offsets ${partition.startOffset}-${partition.endOffset}, ${partition.inSyncReplicas}/${partition.replicas} in sync`}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                      partition.inSyncReplicas < partition.replicas
                        ? 'border-warn/30 bg-warn/10 text-warn'
                        : 'border-white/8 bg-white/[0.03] text-white/40',
                    )}
                  >
                    p{partition.partition}
                    <span className="ml-1 text-white/25">{partition.endOffset}</span>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}

function ClusterBadge({ snapshot }: { snapshot: KafkaSnapshot | null }) {
  const reachable = snapshot?.reachable ?? false

  return (
    <div className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-2">
      <Server className={cn('size-3.5', reachable ? 'text-ready' : 'text-white/30')} />
      <div className="leading-tight">
        <p className="font-mono text-[11px] text-white/70">
          {snapshot?.clusterId ?? 'no cluster'}
        </p>
        <p className="font-mono text-[10px] text-white/30">
          {snapshot?.brokers.length ?? 0} {snapshot?.brokers.length === 1 ? 'broker' : 'brokers'}
          {snapshot?.controllerId != null && ` - controller ${snapshot.controllerId}`}
        </p>
      </div>
    </div>
  )
}

/**
 * Derives events per minute from successive snapshots.
 *
 * The API reports cumulative offsets, so rate is the delta between two
 * snapshots divided by the wall time between them. A negative delta means the
 * topic was recreated or offsets were reset; that sample is discarded rather
 * than plotted as a spike.
 */
function useThroughput(snapshot: KafkaSnapshot | null): Point[] {
  const [series, setSeries] = useState<Point[]>([])
  const previous = useRef<{ total: number; at: number } | null>(null)

  const total = useMemo(
    () => snapshot?.topics.reduce((sum, topic) => sum + topic.totalRecords, 0) ?? null,
    [snapshot],
  )

  const capturedAt = snapshot?.capturedAt

  useEffect(() => {
    if (total === null || !capturedAt) return

    const at = new Date(capturedAt).getTime()
    const last = previous.current

    // The first snapshot only establishes a baseline - there is no rate yet.
    if (last && at > last.at) {
      const deltaRecords = total - last.total
      const deltaMinutes = (at - last.at) / 60000
      if (deltaRecords >= 0 && deltaMinutes > 0) {
        setSeries((current) =>
          [...current, { t: at, v: deltaRecords / deltaMinutes }].slice(-THROUGHPUT_WINDOW),
        )
      }
    }

    previous.current = { total, at }
  }, [total, capturedAt])

  return series
}

function PulseSkeleton() {
  return (
    <Page wide className="space-y-7">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="rounded-panel h-32" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="rounded-panel h-56" />
          <Skeleton className="rounded-panel h-56" />
        </div>
        <Skeleton className="rounded-panel h-80" />
      </div>
    </Page>
  )
}
