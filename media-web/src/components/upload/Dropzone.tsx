import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FileVideo, UploadCloud } from 'lucide-react'
import { bytes } from '@/lib/format'
import { cn } from '@/lib/cn'

const ACCEPT = 'video/*,audio/*'

/**
 * File intake surface.
 *
 * Drag events fire per child element, so enter/leave are counted rather than
 * toggled - otherwise crossing an inner node would flicker the active state.
 */
export function Dropzone({
  file,
  onFile,
  disabled,
}: {
  file: File | null
  onFile: (file: File) => void
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback(
    (list: FileList | null) => {
      const picked = list?.[0]
      if (picked) onFile(picked)
    },
    [onFile],
  )

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        if (!disabled) setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        if (!disabled) accept(e.dataTransfer.files)
      }}
      className={cn(
        'rounded-panel relative overflow-hidden border border-dashed transition-all duration-400',
        dragging
          ? 'border-brand-400/70 bg-brand-500/[0.07] shadow-[0_0_0_6px_rgba(124,92,255,0.08)]'
          : 'border-white/12 bg-white/[0.02] hover:border-white/20',
        disabled && 'pointer-events-none opacity-55',
      )}
    >
      <motion.div
        animate={{ opacity: dragging ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(124,92,255,0.18),transparent_65%)]"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="relative flex w-full flex-col items-center gap-4 px-6 py-14 text-center"
      >
        <motion.span
          animate={{ y: dragging ? -6 : 0, scale: dragging ? 1.06 : 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="glass grid size-14 place-items-center rounded-2xl"
        >
          {file ? (
            <FileVideo className="text-brand-400 size-6" />
          ) : (
            <UploadCloud className="size-6 text-white/60" />
          )}
        </motion.span>

        {file ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/90">{file.name}</p>
            <p className="mt-1 font-mono text-[11px] text-white/35">
              {bytes(file.size)} - {file.type || 'unknown type'}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-white/85">
              Drop a file here, or <span className="text-brand-300">browse</span>
            </p>
            <p className="mt-1.5 text-[12px] text-white/35">Video or audio, up to 250 MB</p>
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files)
          // Reset so re-picking the same file still fires a change event.
          e.target.value = ''
        }}
      />
    </div>
  )
}
