import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { DEMO, DEMO_USER } from '../lib/demo'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function AppProvider({ children, toast }) {
  const [data, setData] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [authState, setAuthState] = useState('checking') // checking | anonymous | authed
  const [fy, setFy] = useState('ALL')

  const refresh = useCallback(async () => {
    // Static demo (GitHub Pages): read the bundled snapshot, act as a viewer.
    if (DEMO) {
      const d = window.GRANT_DATA
      if (d) {
        setData({ ...d, user: DEMO_USER })
        setAuthState('authed')
      } else {
        toast('Demo data snapshot (data.js) is missing.', true)
      }
      return
    }
    try {
      const d = await api('/api/data')
      setData(d)
      setAuthState('authed')
      if (d.user.role !== 'viewer') {
        api('/api/lookups').then(setLookups).catch(() => {})
      }
    } catch (e) {
      if (e.status === 401) {
        setAuthState('anonymous')
        setData(null)
      } else {
        toast('Could not load data: ' + e.message, true)
      }
    }
  }, [toast])

  useEffect(() => { refresh() }, [refresh])

  const login = useCallback(async (username, password) => {
    if (DEMO) return
    await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    if (DEMO) return
    await api('/api/logout', { method: 'POST', body: '{}' })
    setData(null)
    setLookups(null)
    setAuthState('anonymous')
  }, [])

  // any API call that hits a dead session drops us back to the login gate
  const guard = useCallback((e) => {
    if (e && e.status === 401) {
      setAuthState('anonymous')
      return true
    }
    return false
  }, [])

  const user = data?.user || null
  const canWrite = !!user && (user.role === 'grant_manager' || user.role === 'finance_admin')

  const value = useMemo(
    () => ({ data, lookups, authState, user, canWrite, fy, setFy, refresh, login, logout, guard }),
    [data, lookups, authState, user, canWrite, fy, refresh, login, logout, guard],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export { ToastCtx }
