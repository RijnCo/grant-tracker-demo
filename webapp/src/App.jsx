import { Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { ToastProvider } from './components/Toast'
import { useToast } from './state/AppContext'
import AppShell from './components/AppShell'
import LoginGate from './components/LoginGate'
import Overview from './pages/Overview'
import Grants from './pages/Grants'
import GrantDetail from './pages/GrantDetail'
import Expenditures from './pages/Expenditures'
import Agencies from './pages/Agencies'
import Directory from './pages/Directory'
import Audit from './pages/Audit'
import Sefa from './pages/Sefa'
import Sesfa from './pages/Sesfa'
import Funds from './pages/Funds'
import Cra from './pages/Cra'

function Skeleton() {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="skel" style={{ height: 42, width: 340 }} />
      <div className="skel" style={{ height: 90 }} />
      <div style={{ display: 'flex', gap: 14 }}>
        <div className="skel" style={{ height: 260, flex: 3 }} />
        <div className="skel" style={{ height: 260, flex: 2 }} />
      </div>
    </div>
  )
}

function Gate() {
  const { authState, data } = useApp()
  if (authState === 'anonymous') return <LoginGate />
  if (authState === 'checking' || !data) return <Skeleton />
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="grants" element={<Grants />} />
        <Route path="grants/:id" element={<GrantDetail />} />
        <Route path="expenditures" element={<Expenditures />} />
        <Route path="agencies" element={<Agencies />} />
        <Route path="directory" element={<Directory />} />
        <Route path="audit" element={<Audit />} />
        <Route path="sefa" element={<Sefa />} />
        <Route path="sesfa" element={<Sesfa />} />
        <Route path="funds" element={<Funds />} />
        <Route path="cra" element={<Cra />} />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
  )
}

function WithData({ children }) {
  const toast = useToast()
  return <AppProvider toast={toast}>{children}</AppProvider>
}

export default function App() {
  return (
    <ToastProvider>
      <WithData>
        <Gate />
      </WithData>
    </ToastProvider>
  )
}
