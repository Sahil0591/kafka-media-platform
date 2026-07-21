import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Download, Layers, Pencil, Trash2 } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Player } from '@/components/player/Player'
import { Button } from '@/components/ui/Button'
import { Panel, PanelLabel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api, ApiError } from '@/lib/api'
import { compactNumber } from '@/lib/format'
import { useMediaEvent } from '@/stream/StreamProvider'
import type { MediaStatusDetail, Rendition } from '@/lib/types'

export default function Watch() {
  const { mediaId } = useParams<{ mediaId: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<MediaStatusDetail | null>(null)
  const [renditions, setRenditions] = useState<Rendition[]>([])
  const [hlsUrl, setHlsUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const event = useMediaEvent(mediaId)

  const load = useCallback(async () => {
    if (!mediaId) return
    try {
      const status = await api.media.status(mediaId)
      setDetail(status)

      if (status.status === 'READY') {
        // Renditions and the manifest URL only exist once processing finished.
        const [list, playback] = await Promise.all([
          api.media.renditions(mediaId),
          api.media.play(mediaId),
        ])
        setRenditions(list)
        setHlsUrl(playback.hlsUrl)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this title')
    } finally {
      setLoading(false)
    }
  }, [mediaId])

  useEffect(() => {
    void load()
  }, [load])

  // Watching an in-flight title: a terminal event means playback just became
  // possible, so refetch to pick up the manifest and renditions.
  useEffect(() => {
    if (event?.type === 'processed' || event?.type === 'failed') void load()
  }, [event?.type, load])

  // Progress arrives on the stream, so update in place rather than refetching.
  const live: MediaStatusDetail | null =
    detail && event?.type === 'progress'
      ? { ...detail, progress: event.progress, stage: event.stage }
      : detail

  if (loading) return <WatchSkeleton />

  if (error || !live) {
    return (
      <Page>
        <Panel className="mx-auto mt-16 max-w-md text-center">
          <AlertTriangle className="text-warn mx-auto size-6" />
          <p className="mt-4 text-sm text-white/70">{error ?? 'Title not found'}</p>
          <Link to="/" className="mt-5 inline-block">
            <Button variant="glass">Back to library</Button>
          </Link>
        </Panel>
      </Page>
    )
  }

  return (
    <Page wide className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[13px] text-white/45 transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Library
      </Link>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {live.status === 'READY' ? (
            <Player src={hlsUrl} title={live.title} />
          ) : (
            <NotReady detail={live} />
          )}

          <TitleBlock
            detail={live}
            onRenamed={(title) => setDetail((current) => (current ? { ...current, title } : current))}
          />
        </div>

        <aside className="space-y-6">
          <RenditionsPanel renditions={renditions} status={live.status} />
          <ActionsPanel mediaId={live.id} onDeleted={() => navigate('/', { replace: true })} />
        </aside>
      </div>
    </Page>
  )
}

function TitleBlock({
  detail,
  onRenamed,
}: {
  detail: MediaStatusDetail
  onRenamed: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(detail.title)
  const [saving, setSaving] = useState(false)

  async function save() {
    const next = draft.trim()
    if (!next || next === detail.title) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await api.media.rename(detail.id, next)
      onRenamed(next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
                if (e.key === 'Escape') {
                  setDraft(detail.title)
                  setEditing(false)
                }
              }}
              className="focus:border-brand-400/50 w-full max-w-md rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xl text-white outline-none"
            />
            <Button size="sm" loading={saving} onClick={() => void save()}>
              <Check className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-2xl">{detail.title}</h1>
            <button
              type="button"
              onClick={() => {
                setDraft(detail.title)
                setEditing(true)
              }}
              aria-label="Rename"
              className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}

        <p className="mt-2 text-[13px] text-white/40">
          {detail.type === 'AUDIO' ? 'Audio' : 'Video'} - {detail.message}
        </p>
      </div>

      <StatusBadge status={detail.status} />
    </div>
  )
}

/** Shown in place of the player while the pipeline still owns this title. */
function NotReady({ detail }: { detail: MediaStatusDetail }) {
  const failed = detail.status === 'FAILED'

  return (
    <div className="rounded-panel bg-abyss grid aspect-video place-items-center border border-white/8 px-6 text-center">
      <div>
        <StatusBadge status={detail.status} />
        <p className="mt-5 text-lg text-white/80">
          {failed ? 'This title could not be processed' : 'Still moving through the pipeline'}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/40">
          {failed
            ? (detail.error ?? 'The worker reported a failure. Try uploading the file again.')
            : 'Playback unlocks the moment the worker publishes the HLS manifests. This page updates on its own.'}
        </p>
        {!failed && detail.progress != null && (
          <div className="mx-auto mt-6 w-56">
            <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
              <div
                className="from-brand-500 to-pulse-400 h-full rounded-full bg-gradient-to-r transition-[width] duration-700"
                style={{ width: `${detail.progress}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-white/40 tabular-nums">
              {detail.stage?.toLowerCase() ?? 'working'} - {detail.progress}%
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function RenditionsPanel({ renditions, status }: { renditions: Rendition[]; status: string }) {
  return (
    <Panel>
      <div className="flex items-center gap-2">
        <Layers className="size-3.5 text-white/35" />
        <PanelLabel>Renditions</PanelLabel>
      </div>

      {renditions.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-white/35">
          {status === 'READY' ? 'No renditions recorded.' : 'Published once transcoding completes.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {renditions.map((rendition) => (
            <li
              key={rendition.id}
              className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5"
            >
              <span className="text-[13px] font-medium text-white/85">{rendition.quality}</span>
              <span className="font-mono text-[11px] text-white/35">
                {rendition.codec ?? 'h264'}
                {rendition.bitrateKbps ? ` - ${compactNumber(rendition.bitrateKbps)}k` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ActionsPanel({ mediaId, onDeleted }: { mediaId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function download() {
    setProblem(null)
    try {
      const { downloadUrl } = await api.media.download(mediaId)
      window.open(downloadUrl, '_blank', 'noopener')
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Could not build a download link')
    }
  }

  async function remove() {
    setWorking(true)
    setProblem(null)
    try {
      await api.media.remove(mediaId)
      onDeleted()
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Delete failed')
      setWorking(false)
    }
  }

  return (
    <Panel>
      <PanelLabel>Manage</PanelLabel>

      <div className="mt-4 space-y-2.5">
        <Button variant="glass" className="w-full justify-start" onClick={() => void download()}>
          <Download className="size-4" />
          Download original
        </Button>

        {/* Deleting also removes every HLS object, so it is confirmed inline */}
        {confirming ? (
          <div className="border-fail/25 bg-fail/8 space-y-2.5 rounded-xl border p-3">
            <p className="text-[12px] text-white/70">
              This removes the source file, every rendition, and its history. It cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={working} onClick={() => void remove()}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full justify-start" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
            Delete title
          </Button>
        )}

        {problem && <p className="text-fail text-[12px]">{problem}</p>}
      </div>
    </Panel>
  )
}

function WatchSkeleton() {
  return (
    <Page wide className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Skeleton className="rounded-panel aspect-video w-full" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="space-y-6">
          <Skeleton className="rounded-panel h-44 w-full" />
          <Skeleton className="rounded-panel h-36 w-full" />
        </div>
      </div>
    </Page>
  )
}
