import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError } from '../api/client'
import type { MeResponse, ServerConfigResponse } from '../api/types'

type AuthState = {
  user: MeResponse | null
  config: ServerConfigResponse | null
  loading: boolean
  login: (username: string, password: string, workstation?: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null)
  const [config, setConfig] = useState<ServerConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setUser(me)
      try {
        setConfig(await api.config())
      } catch {
        setConfig(null)
      }
    } catch (e) {
      setUser(null)
      setConfig(null)
      if (!(e instanceof ApiError && e.status === 401)) throw e
    }
  }, [])

  useEffect(() => {
    refresh()
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [refresh])

  const login = useCallback(async (username: string, password: string, workstation?: string) => {
    const me = await api.login(username, password, workstation)
    setUser(me)
    try {
      setConfig(await api.config())
    } catch {
      setConfig(null)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setConfig(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, config, loading, login, logout, refresh }),
    [user, config, loading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
