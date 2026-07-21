import { Aurora } from '@/components/ui/Aurora'
import { Button } from '@/components/ui/Button'
import { Panel, PanelLabel } from '@/components/ui/Panel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Design system preview.
 *
 * Temporary shell that renders the primitives so the visual language can be
 * reviewed before any product surface is wired to it. Replaced by the router
 * in the next step.
 */
export default function App() {
  return (
    <div className="grain min-h-dvh">
      <Aurora />

      <main className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-[11px] font-medium tracking-[0.28em] text-white/35 uppercase">Aperture</p>
        <h1 className="mt-4 text-5xl leading-[1.05] sm:text-6xl">
          A media platform that <span className="text-spectrum">shows its pulse</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/50">
          Every upload becomes a stream of events. This interface renders that stream as it happens.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Button size="lg">Primary action</Button>
          <Button size="lg" variant="glass">
            Glass action
          </Button>
          <Button size="lg" variant="ghost">
            Ghost action
          </Button>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          <Panel interactive>
            <PanelLabel>Status vocabulary</PanelLabel>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status="UPLOADING" />
              <StatusBadge status="PROCESSING" />
              <StatusBadge status="TRANSCODING" />
              <StatusBadge status="READY" />
              <StatusBadge status="FAILED" />
            </div>
          </Panel>

          <Panel>
            <PanelLabel>Loading state</PanelLabel>
            <div className="mt-4 space-y-2.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/12" />
            </div>
          </Panel>
        </div>
      </main>
    </div>
  )
}
