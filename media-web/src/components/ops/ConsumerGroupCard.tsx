import { Users } from 'lucide-react'
import { BarRow } from '@/components/charts/BarRow'
import { Panel } from '@/components/ui/Panel'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { KafkaConsumerGroup } from '@/lib/types'

/** Lag above this reads as a backlog worth flagging rather than normal churn. */
const LAG_ALERT = 50

/**
 * Kafka consumer group state.
 *
 * The group state chip is a status token, so it always ships with its literal
 * Kafka state as text - STABLE, REBALANCING, EMPTY - never colour alone.
 */
export function ConsumerGroupCard({ group }: { group: KafkaConsumerGroup }) {
  const tone = stateTone(group.state)
  const maxLag = Math.max(...group.topics.map((topic) => topic.lag), 1)

  return (
    <Panel className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[12.5px] text-white/85">{group.groupId}</p>
          {group.coordinator && (
            <p className="mt-1 truncate font-mono text-[10px] text-white/25">
              coordinator {group.coordinator}
            </p>
          )}
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium',
            tone.chip,
          )}
        >
          <span className={cn('size-1.5 rounded-full', tone.dot, tone.live && 'animate-pulse-ring')} />
          {group.state}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 text-white/45">
          <Users className="size-3.5" />
          <span className="tabular-nums">{group.memberCount}</span>
          {group.memberCount === 1 ? 'member' : 'members'}
        </span>

        <span className="text-white/25">-</span>

        <span className={cn('font-mono tabular-nums', group.totalLag > LAG_ALERT ? 'text-warn' : 'text-white/45')}>
          {compactNumber(group.totalLag)} lag
        </span>
      </div>

      {group.members.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {group.members.map((member) => (
            <li
              key={member.memberId}
              title={`${member.clientId} on ${member.host}`}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/40"
            >
              {/* Real client ids embed a UUID and overflow the chip; the full
                  value stays available in the title attribute. */}
              <span className="truncate">{member.clientId || 'consumer'}</span>
              <span className="shrink-0 text-white/25">{member.assignedPartitions}p</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 space-y-3">
        {group.topics.length === 0 ? (
          <p className="text-[11.5px] text-white/30">No committed offsets on platform topics.</p>
        ) : (
          group.topics.map((topic) => (
            <BarRow
              key={topic.topic}
              label={topic.topic}
              value={topic.lag}
              max={maxLag}
              tone={topic.lag > LAG_ALERT ? 'warn' : 'brand'}
              hint={`committed ${compactNumber(topic.committedOffset)} of ${compactNumber(topic.endOffset)}`}
            />
          ))
        )}
      </div>
    </Panel>
  )
}

function stateTone(state: string) {
  switch (state.toUpperCase()) {
    case 'STABLE':
      return { chip: 'border-ready/25 bg-ready/10 text-ready', dot: 'bg-ready', live: false }
    case 'PREPARINGREBALANCE':
    case 'COMPLETINGREBALANCE':
      return { chip: 'border-warn/25 bg-warn/10 text-warn', dot: 'bg-warn', live: true }
    case 'EMPTY':
    case 'DEAD':
      return { chip: 'border-white/12 bg-white/5 text-white/45', dot: 'bg-white/35', live: false }
    default:
      return { chip: 'border-live/25 bg-live/10 text-live', dot: 'bg-live', live: true }
  }
}
