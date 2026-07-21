import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Film, UploadCloud } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Hero } from '@/components/media/Hero'
import { MediaCard } from '@/components/media/MediaCard'
import { Rail } from '@/components/media/Rail'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { useLibrary, type LiveMedia } from '@/hooks/useLibrary'
import { useAuth } from '@/auth/AuthContext'

export default function Library() {
  const { profile } = useAuth()
  const { items, loading, error, reload } = useLibrary()

  const groups = useMemo(() => partition(items), [items])

  if (loading) return <LibrarySkeleton />

  if (error) {
    return (
      <Page>
        <Panel className="mx-auto mt-16 max-w-md text-center">
          <AlertTriangle className="text-warn mx-auto size-6" />
          <p className="mt-4 text-sm text-white/70">{error}</p>
          <Button variant="glass" className="mt-5" onClick={() => void reload()}>
            Try again
          </Button>
        </Panel>
      </Page>
    )
  }

  if (items.length === 0) return <EmptyLibrary />

  return (
    <Page wide className="space-y-12">
      <PageHeader
        eyebrow={`Welcome back, ${profile?.username ?? ''}`}
        title="Your library"
        description="Everything you have sent through the pipeline, with live status as it changes."
        actions={
          <Link to="/upload">
            <Button>
              <UploadCloud className="size-4" />
              Upload
            </Button>
          </Link>
        }
      />

      {groups.featured && <Hero item={groups.featured} inFlightCount={groups.inFlight.length} />}

      {groups.inFlight.length > 0 && (
        <Rail title="In the pipeline" count={groups.inFlight.length}>
          {groups.inFlight.map((item, index) => (
            <RailItem key={item.id}>
              <MediaCard item={item} index={index} />
            </RailItem>
          ))}
        </Rail>
      )}

      {groups.ready.length > 0 && (
        <Rail title="Ready to stream" count={groups.ready.length}>
          {groups.ready.map((item, index) => (
            <RailItem key={item.id}>
              <MediaCard item={item} index={index} />
            </RailItem>
          ))}
        </Rail>
      )}

      {groups.failed.length > 0 && (
        <Rail title="Needs attention" count={groups.failed.length}>
          {groups.failed.map((item, index) => (
            <RailItem key={item.id}>
              <MediaCard item={item} index={index} />
            </RailItem>
          ))}
        </Rail>
      )}
    </Page>
  )
}

/** Fixed-width slot so rails keep a steady rhythm regardless of item count. */
function RailItem({ children }: { children: React.ReactNode }) {
  return <div className="w-[17rem] shrink-0 snap-start sm:w-[19rem]">{children}</div>
}

interface Groups {
  featured: LiveMedia | null
  inFlight: LiveMedia[]
  ready: LiveMedia[]
  failed: LiveMedia[]
}

/**
 * Splits the library into rails. In-flight work leads because it is the only
 * part of the page that is changing; the hero is the newest finished title,
 * and it stays in the ready rail so nothing silently disappears.
 */
function partition(items: LiveMedia[]): Groups {
  const byRecency = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  const ready = byRecency.filter((item) => item.status === 'READY')
  const failed = byRecency.filter((item) => item.status === 'FAILED')
  const inFlight = byRecency.filter(
    (item) => item.status === 'UPLOADING' || item.status === 'PROCESSING' || item.status === 'TRANSCODING',
  )

  return { featured: ready[0] ?? null, inFlight, ready, failed }
}

function EmptyLibrary() {
  return (
    <Page>
      <div className="mx-auto mt-14 max-w-lg text-center">
        <div className="glass mx-auto grid size-16 place-items-center rounded-2xl">
          <Film className="text-brand-400 size-7" />
        </div>
        <h1 className="mt-7 text-2xl">Nothing here yet</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/45">
          Send your first file through the pipeline. You will watch it move across Kafka, transcode into
          adaptive renditions, and land ready to stream.
        </p>
        <Link to="/upload" className="mt-7 inline-block">
          <Button size="lg">
            <UploadCloud className="size-4" />
            Upload your first title
          </Button>
        </Link>
      </div>
    </Page>
  )
}

function LibrarySkeleton() {
  return (
    <Page wide className="space-y-12">
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="rounded-panel aspect-[16/10] w-full sm:aspect-[21/9] lg:aspect-[2.6/1]" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-36" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="rounded-panel h-56 w-[17rem] shrink-0 sm:w-[19rem]" />
          ))}
        </div>
      </div>
    </Page>
  )
}
