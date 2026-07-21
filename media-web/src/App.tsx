import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { StreamProvider } from '@/stream/StreamProvider'
import { AppShell } from '@/components/layout/AppShell'
import { Aurora } from '@/components/ui/Aurora'
import { Mark } from '@/components/brand/Wordmark'
import SignIn from '@/routes/SignIn'

// Route-level code splitting keeps the first paint - the sign-in screen - small.
const Library = lazy(() => import('@/routes/Library'))
const Upload = lazy(() => import('@/routes/Upload'))
const Pulse = lazy(() => import('@/routes/Pulse'))
const Watch = lazy(() => import('@/routes/Watch'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}

/**
 * Decides between the entry screen and the authenticated shell.
 *
 * The stream connection lives above the router so it survives navigation, and
 * is only enabled once a session exists.
 */
function Gate() {
  const { profile, restoring } = useAuth()
  const location = useLocation()

  if (restoring) return <BootSplash />

  if (!profile) {
    return (
      <Routes>
        <Route path="*" element={<SignIn />} />
      </Routes>
    )
  }

  return (
    <StreamProvider enabled>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <RouteFrame key={location.pathname}>
                <Library />
              </RouteFrame>
            }
          />
          <Route
            path="upload"
            element={
              <RouteFrame key={location.pathname}>
                <Upload />
              </RouteFrame>
            }
          />
          <Route
            path="pulse"
            element={
              <RouteFrame key={location.pathname}>
                <Pulse />
              </RouteFrame>
            }
          />
          <Route
            path="watch/:mediaId"
            element={
              <RouteFrame key={location.pathname}>
                <Watch />
              </RouteFrame>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </StreamProvider>
  )
}

/** Suspense boundary plus the shared page-enter transition. */
function RouteFrame({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

function RouteFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Mark className="size-8 animate-pulse" />
    </div>
  )
}

function BootSplash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Aurora />
      <Mark className="size-10 animate-pulse" />
    </div>
  )
}
