import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, RotateCcw, Sparkles, Type } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Dropzone } from '@/components/upload/Dropzone'
import { PipelineTrack, type Stage, type StageState } from '@/components/upload/PipelineTrack'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Panel, PanelLabel } from '@/components/ui/Panel'
import { api, ApiError } from '@/lib/api'
import { useMediaEvent } from '@/stream/StreamProvider'
import type { MediaType } from '@/lib/types'

type Phase =
  | 'idle'
  | 'registering'
  | 'transferring'
  | 'queueing'
  | 'processing'
  | 'ready'
  | 'failed'

export default function Upload() {
  const navigate = useNavigate()

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [mediaId, setMediaId] = useState<string | null>(null)
  const [transferPct, setTransferPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /** Which hop was running when things went wrong. */
  const [failedAt, setFailedAt] = useState<Phase | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  /**
   * Mirrors `phase` synchronously. A catch block runs against the closure it was
   * created in, where the state variable is still the pre-await value, so the
   * ref is what tells us which hop actually threw.
   */
  const phaseRef = useRef<Phase>('idle')

  function advance(next: Phase) {
    phaseRef.current = next
    setPhase(next)
  }

  // Live worker events for this upload, once it is on the bus.
  const event = useMediaEvent(mediaId ?? undefined)

  // Terminal events move the phase; everything before that is driven locally.
  useEffect(() => {
    if (!event || phase === 'ready' || phase === 'failed') return
    if (event.type === 'processed') advance('ready')
    else if (event.type === 'failed') {
      setFailedAt('processing')
      advance('failed')
      setError(event.message ?? 'Processing failed')
    } else if (event.type === 'progress' && phase === 'queueing') advance('processing')
  }, [event, phase])

  useEffect(() => () => abortRef.current?.abort(), [])

  const mediaType: MediaType = file?.type.startsWith('audio/') ? 'AUDIO' : 'VIDEO'
  const busy = phase !== 'idle' && phase !== 'ready' && phase !== 'failed'

  function pickFile(next: File) {
    setFile(next)
    setError(null)
    if (!title.trim()) setTitle(stripExtension(next.name))
  }

  function reset() {
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setTitle('')
    advance('idle')
    setMediaId(null)
    setTransferPct(0)
    setError(null)
    setFailedAt(null)
  }

  async function start() {
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setFailedAt(null)
    setTransferPct(0)
    advance('registering')

    try {
      const contentType = file.type || (mediaType === 'AUDIO' ? 'audio/mpeg' : 'video/mp4')

      const init = await api.media.initUpload({
        title: title.trim() || stripExtension(file.name),
        type: mediaType,
        filename: file.name,
        contentType,
      })
      setMediaId(init.mediaId)

      advance('transferring')
      await api.media.uploadFile(init.mediaId, file, setTransferPct, controller.signal)

      // Publishing media.uploaded is what actually hands the file to the workers.
      advance('queueing')
      await api.media.completeUpload(init.mediaId, init.objectKey, contentType)
    } catch (e) {
      setFailedAt(phaseRef.current)
      advance('failed')
      setError(e instanceof ApiError ? e.message : 'Upload failed')
    }
  }

  const stages = useMemo(
    () => buildStages({ phase, failedAt, transferPct, event, mediaType }),
    [phase, failedAt, transferPct, event, mediaType],
  )

  return (
    <Page className="space-y-8">
      <PageHeader
        eyebrow="New title"
        title="Upload"
        description="Your file is registered, transferred to object storage, then announced on Kafka. Everything after that is the workers talking back."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Dropzone file={file} onFile={pickFile} disabled={busy} />

          <Panel>
            <PanelLabel>Details</PanelLabel>
            <div className="mt-4 space-y-4">
              <Field
                label="Title"
                icon={<Type className="size-4" />}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="How it appears in your library"
                disabled={busy}
              />

              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
                <span className="text-[11px] font-medium tracking-[0.14em] text-white/45 uppercase">
                  Detected type
                </span>
                <span className="font-mono text-[12px] text-brand-200">
                  {file ? mediaType : '-'}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => void start()} disabled={!file || busy} loading={busy}>
                <Sparkles className="size-4" />
                {busy ? 'Working' : 'Start pipeline'}
              </Button>

              {(phase === 'ready' || phase === 'failed') && (
                <Button variant="glass" onClick={reset}>
                  <RotateCcw className="size-4" />
                  Upload another
                </Button>
              )}

              {phase === 'ready' && mediaId && (
                <Button variant="glass" onClick={() => navigate(`/watch/${mediaId}`)}>
                  <Play className="size-4 fill-current" />
                  Watch it
                </Button>
              )}
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="border-fail/25 bg-fail/10 text-fail mt-4 rounded-lg border px-3 py-2 text-xs"
              >
                {error}
              </motion.p>
            )}
          </Panel>
        </div>

        <Panel className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between">
            <PanelLabel>Pipeline</PanelLabel>
            {mediaId && (
              <code className="font-mono text-[10px] text-white/25">{mediaId.slice(0, 8)}</code>
            )}
          </div>

          <div className="mt-6">
            <PipelineTrack stages={stages} />
          </div>

          {phase === 'ready' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-ready/20 bg-ready/8 mt-6 rounded-xl border p-4"
            >
              <p className="text-ready text-[13px] font-medium">Ready to stream</p>
              <p className="mt-1 text-[11.5px] text-white/45">
                Adaptive renditions are published.{' '}
                <Link to="/" className="text-brand-300 underline-offset-2 hover:underline">
                  Back to library
                </Link>
              </p>
            </motion.div>
          )}
        </Panel>
      </div>
    </Page>
  )
}

/** The five hops a file actually makes, in order. */
const HOPS: Phase[] = ['registering', 'transferring', 'queueing', 'processing', 'ready']

/**
 * Projects the phase and the latest worker event onto those hops.
 *
 * Progress percentages come only from the source that genuinely knows them -
 * the browser for the byte transfer, the worker for transcoding. Nothing is
 * interpolated to look busier than it is. On failure, `failedAt` records which
 * hop was running so the error lands on the right node rather than the last.
 */
function buildStages({
  phase,
  failedAt,
  transferPct,
  event,
  mediaType,
}: {
  phase: Phase
  failedAt: Phase | null
  transferPct: number
  event: ReturnType<typeof useMediaEvent>
  mediaType: MediaType
}): Stage[] {
  const current = phase === 'failed' ? failedAt : phase
  const currentIndex = current ? HOPS.indexOf(current) : -1

  const stateOf = (hop: Phase): StageState => {
    const index = HOPS.indexOf(hop)
    if (currentIndex < 0) return 'pending'
    if (index < currentIndex) return 'done'
    if (index > currentIndex) return 'pending'
    if (phase === 'failed') return 'failed'
    // 'ready' is the terminal hop, so reaching it means it is complete.
    return hop === 'ready' ? 'done' : 'active'
  }

  const transcode = stateOf('processing')

  return [
    {
      id: 'register',
      label: 'Register',
      hint: 'POST /media/init-upload - reserves the id and object key',
      state: stateOf('registering'),
    },
    {
      id: 'transfer',
      label: 'Transfer',
      hint: 'Multipart PUT into MinIO object storage',
      state: stateOf('transferring'),
      progress: phase === 'transferring' ? Math.round(transferPct * 100) : null,
    },
    {
      id: 'announce',
      label: 'Announce',
      hint: 'media.uploaded published to Kafka',
      state: stateOf('queueing'),
    },
    {
      id: 'transcode',
      label: mediaType === 'AUDIO' ? 'Encode' : 'Transcode',
      hint: 'Worker runs FFmpeg and reports progress back over the bus',
      state: transcode,
      progress: transcode === 'active' ? (event?.progress ?? null) : null,
      detail:
        transcode === 'active' && event?.stage
          ? `${event.stage.toLowerCase()} - ${event.message ?? 'working'}`
          : null,
    },
    {
      id: 'publish',
      label: 'Publish',
      hint: 'media.processed - HLS manifests live and status set to READY',
      state: stateOf('ready'),
    },
  ]
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}
