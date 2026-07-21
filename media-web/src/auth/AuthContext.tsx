import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '@/lib/api'
import type { Profile } from '@/lib/types'

interface AuthState {
  profile: Profile | null
  /** True until the stored token has been checked against the API. */
  restoring: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, email: string, password: string) => Promise<void>
  signOut: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [restoring, setRestoring] = useState(Boolean(getToken()))

  const signOut = useCallback(() => {
    setToken(null)
    setProfile(null)
  }, [])

  const refresh = useCallback(async () => {
    setProfile(await api.users.me())
  }, [])

  // A token rejected anywhere in the app ends the session exactly once.
  useEffect(() => {
    setUnauthorizedHandler(signOut)
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  // Restore a stored session on first mount. A stale token resolves to signed
  // out rather than leaving the UI stuck on a spinner.
  useEffect(() => {
    if (!getToken()) {
      setRestoring(false)
      return
    }
    let cancelled = false
    api.users
      .me()
      .then((me) => {
        if (!cancelled) setProfile(me)
      })
      .catch(() => {
        if (!cancelled) setToken(null)
      })
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const auth = await api.auth.login(username, password)
    setToken(auth.token)
    setProfile(await api.users.me())
  }, [])

  const signUp = useCallback(async (username: string, email: string, password: string) => {
    const auth = await api.auth.register(username, email, password)
    setToken(auth.token)
    setProfile(await api.users.me())
  }, [])

  const value = useMemo<AuthState>(
    () => ({ profile, restoring, signIn, signUp, signOut, refresh }),
    [profile, restoring, signIn, signUp, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
