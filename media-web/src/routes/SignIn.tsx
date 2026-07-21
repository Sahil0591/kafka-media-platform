import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, KeyRound, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Mark } from '@/components/brand/Wordmark'
import { useAuth } from '@/auth/AuthContext'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

type Mode = 'signin' | 'signup'

/**
 * Cinematic split entry screen: a narrative panel on the left, the form on the
 * right. Below the large breakpoint the narrative collapses and the form takes
 * the full frame.
 */
export default function SignIn() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signin') await signIn(username.trim(), password)
      else await signUp(username.trim(), email.trim(), password)
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 401
            ? 'Those credentials did not match an account.'
            : e.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  function switchTo(next: Mode) {
    setMode(next)
    setError(null)
  }

  return (
    <div className="grain grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <NarrativePanel />

      <div className="flex items-center justify-center px-6 py-14 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden">
            <Mark className="size-8" />
          </div>

          <h1 className="mt-6 text-3xl lg:mt-0">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {mode === 'signin'
              ? 'Sign in to your library and live pipeline.'
              : 'A few details and your first upload is minutes away.'}
          </p>

          {/* Sliding pill selector - the indicator animates between the two tabs */}
          <div className="relative mt-8 grid grid-cols-2 rounded-xl border border-white/8 bg-white/[0.03] p-1">
            {(['signin', 'signup'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => switchTo(option)}
                className={cn(
                  'relative z-10 h-9 rounded-lg text-[13px] font-medium transition-colors duration-300',
                  mode === option ? 'text-white' : 'text-white/40 hover:text-white/70',
                )}
              >
                {option === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
            <motion.div
              layout
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
              style={{ left: mode === 'signin' ? '0.25rem' : 'calc(50% + 0rem)' }}
            />
          </div>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field
              label="Username"
              autoComplete="username"
              icon={<User className="size-4" />}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your handle"
              required
              minLength={3}
            />

            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <Field
                    label="Email"
                    type="email"
                    autoComplete="email"
                    icon={<AtSign className="size-4" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@studio.com"
                    required={mode === 'signup'}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Field
              label="Password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              icon={<KeyRound className="size-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
            />

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="rounded-lg border border-fail/25 bg-fail/10 px-3 py-2 text-xs text-fail"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  )
}

/** Left-hand story panel. Purely atmospheric, so it is hidden from assistive tech. */
function NarrativePanel() {
  const beats = [
    { topic: 'media.uploaded', detail: 'accepted - queued for transcode' },
    { topic: 'media.transcode.progress', detail: '720p - 64%' },
    { topic: 'media.processed', detail: 'ready in 720p, 480p' },
  ]

  return (
    <div className="relative hidden overflow-hidden border-r border-white/6 lg:flex lg:flex-col lg:justify-between lg:p-14">
      <div className="animate-aurora absolute -top-40 -left-32 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.24),transparent_62%)] blur-3xl" />
      <div
        className="animate-aurora absolute -right-40 -bottom-48 h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(18,184,214,0.18),transparent_62%)] blur-3xl"
        style={{ animationDelay: '-12s' }}
      />

      <div className="relative">
        <Mark className="size-9" />
      </div>

      <div className="relative max-w-md">
        <h2 className="text-[2.75rem] leading-[1.08]">
          Upload once.
          <br />
          <span className="text-spectrum">Watch it move.</span>
        </h2>
        <p className="mt-5 text-[15px] leading-relaxed text-white/45">
          Every file entering Aperture becomes a stream of events across Kafka. This interface renders
          that stream as it happens - no refresh, no guessing.
        </p>

        <ul className="mt-10 space-y-2.5" aria-hidden>
          {beats.map((beat, index) => (
            <motion.li
              key={beat.topic}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.18, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="glass flex items-center gap-3 rounded-xl px-4 py-3"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-live" />
              <code className="font-mono text-[11px] text-brand-200">{beat.topic}</code>
              <span className="truncate text-[11px] text-white/40">{beat.detail}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      <p className="relative font-mono text-[11px] tracking-wide text-white/25">
        Kafka - HLS - MinIO - Postgres
      </p>
    </div>
  )
}
