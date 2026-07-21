import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, LayoutGrid, LogOut, Menu, UploadCloud, X } from 'lucide-react'
import { Aurora } from '@/components/ui/Aurora'
import { Mark, Wordmark } from '@/components/brand/Wordmark'
import { ConnectionPill } from '@/components/layout/ConnectionPill'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/', label: 'Library', icon: LayoutGrid, end: true },
  { to: '/upload', label: 'Upload', icon: UploadCloud, end: false },
  { to: '/pulse', label: 'Pulse', icon: Activity, end: false },
]

/**
 * Persistent application frame: fixed rail on desktop, slide-over drawer below
 * the large breakpoint. Only the outlet re-renders on navigation, which keeps
 * the SSE connection and the aurora animation continuous.
 */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // A route change should always dismiss the mobile drawer.
  useEffect(() => setDrawerOpen(false), [location.pathname])

  return (
    <div className="grain min-h-dvh">
      <Aurora />

      <div className="lg:grid lg:grid-cols-[16rem_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-white/6 px-5 py-6 lg:flex">
          <SidebarContent />
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <TopBar onOpenDrawer={() => setDrawerOpen(true)} />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}

function SidebarContent() {
  const { profile, signOut } = useAuth()

  return (
    <>
      <NavLink to="/" className="px-2">
        <Wordmark />
      </NavLink>

      <nav className="mt-9 flex flex-col gap-1">
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rule" />
        <div className="flex items-center gap-3 px-2">
          <Avatar name={profile?.username ?? '?'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white/85">{profile?.username}</p>
            <p className="truncate text-[11px] text-white/35">{profile?.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="rounded-lg p-2 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </>
  )
}

function NavItem({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className={cn(
            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-300',
            isActive ? 'text-white' : 'text-white/45 hover:bg-white/[0.04] hover:text-white/80',
          )}
        >
          {/* Shared layout id slides the active pill between items */}
          {isActive && (
            <motion.span
              layoutId="nav-active"
              transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              className="absolute inset-0 rounded-xl border border-white/8 bg-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
            />
          )}
          <Icon className={cn('relative size-[18px]', isActive && 'text-brand-400')} />
          <span className="relative">{label}</span>
        </span>
      )}
    </NavLink>
  )
}

function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-void/55 backdrop-blur-xl">
      <div className="flex h-15 items-center gap-3 px-5 py-3.5 sm:px-8">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        <span className="lg:hidden">
          <Mark className="size-6" />
        </span>

        <div className="ml-auto">
          <ConnectionPill />
        </div>
      </div>
    </header>
  )
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-void/70 backdrop-blur-sm lg:hidden"
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="glass fixed inset-y-0 left-0 z-50 flex w-72 flex-col rounded-r-2xl px-5 py-6 lg:hidden"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute top-5 right-4 rounded-lg p-2 text-white/40 transition-colors hover:text-white"
            >
              <X className="size-4" />
            </button>
            <SidebarContent />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="from-brand-600 to-pulse-500 grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[12px] font-semibold text-white uppercase">
      {name.slice(0, 1)}
    </span>
  )
}
