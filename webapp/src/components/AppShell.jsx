import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, SunMedium, Moon, LogOut, Plus, ReceiptText, CircleHelp } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { DEMO } from '../lib/demo'
import CommandPalette, { PAGES } from './CommandPalette'
import Tour, { TOUR_DONE_KEY } from './Tour'
import ExpenditureModal from './forms/ExpenditureModal'
import AwardModal from './forms/AwardModal'

const TITLES = {
  '/': 'Overview', '/grants': 'Grants', '/expenditures': 'Expenditures',
  '/funds': 'Operating funds', '/cra': 'CRA districts', '/agencies': 'Agencies',
  '/directory': 'Directory', '/audit': 'Audit trail',
  '/sefa': 'SEFA report', '/sesfa': 'SESFA report', '/revenue': 'Revenue tracker',
  '/billing': 'Utility billing', '/integrity': 'Revenue integrity',
}

// pages where the global Federal/State scope actually filters what you see
const SOURCE_SCOPED = new Set(['/', '/grants', '/expenditures', '/agencies'])

function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light')
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    localStorage.setItem('pcg-theme', next)
    setTheme(next)
  }
  return [theme, toggle]
}

export default function AppShell() {
  const { data, user, canWrite, fy, setFy, source, setSource, logout } = useApp()
  const location = useLocation()
  const [theme, toggleTheme] = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [expOpen, setExpOpen] = useState(false)
  const [awardOpen, setAwardOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  // first sign-in on this browser: walk through how the software works
  useEffect(() => {
    if (localStorage.getItem(TOUR_DONE_KEY)) return
    const t = setTimeout(() => setTourOpen(true), 700)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const title = TITLES[location.pathname]
    || (location.pathname.startsWith('/grants/') ? 'Grant detail' : 'Overview')
  const initials = (user?.display_name || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const fyOptions = ['ALL', ...(data?.fiscal_years || []).map((f) => f.fy_label)]

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-sun" aria-hidden="true" />
          <div className="b-text">
            <div className="b-name">Pelican Shores</div>
            <div className="b-sub">City Operations</div>
          </div>
        </div>
        <div className="navlist">
          {[...new Set(PAGES.map((p) => p.section))].map((section) => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {PAGES.filter((p) => p.section === section).map((p) => {
                const Icon = p.icon
                return (
                  <NavLink key={p.to} to={p.to} end={p.to === '/'}
                    data-tour={'nav' + (p.to === '/' ? '-overview' : p.to.replace('/', '-'))}
                    className={({ isActive }) => 'navitem' + (isActive ? ' active' : '')}>
                    <Icon />
                    <span>{p.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </div>
        <div className="foot">
          <div className="avatar">{initials}</div>
          <div className="f-main">
            <div className="f-name">{user?.display_name}</div>
            <div className="f-role">{user?.role?.replace('_', ' ')}</div>
          </div>
          {!DEMO && (
            <button className="btn ghost icon small" title="Sign out" onClick={logout}>
              <LogOut />
            </button>
          )}
        </div>
      </aside>

      <div className="content">
        {DEMO && (
          <div className="demo-ribbon" role="note">
            Static demo — fictional data for the City of Pelican Shores grant tracker, read-only.
            {' '}The full app adds sign-in, data entry, amendments, and uploads.
          </div>
        )}
        <div className="topbar">
          <div className="page-title">{title}</div>
          <div className="spacer" />
          {SOURCE_SCOPED.has(location.pathname) && (
            <span className="seg" role="group" aria-label="Funding source" data-tour="source-scope">
              {['ALL', 'FEDERAL', 'STATE'].map((v) => (
                <button key={v} aria-pressed={source === v} onClick={() => setSource(v)}>
                  {v === 'ALL' ? 'All sources' : v === 'FEDERAL' ? 'Federal' : 'State'}
                </button>
              ))}
            </span>
          )}
          <span className="seg" role="group" aria-label="Fiscal year" data-tour="fy-filter">
            {fyOptions.map((v) => (
              <button key={v} aria-pressed={fy === v} onClick={() => setFy(v)}>
                {v === 'ALL' ? 'All years' : v}
              </button>
            ))}
          </span>
          <button className="btn ghost" onClick={() => setPaletteOpen(true)} data-tour="search">
            <Search /> Search <span className="kbd">Ctrl K</span>
          </button>
          <button className="btn ghost icon" title="Take the tour" aria-label="Take the tour"
                  onClick={() => setTourOpen(true)}>
            <CircleHelp />
          </button>
          <button className="btn ghost icon" title="Toggle theme" onClick={toggleTheme}>
            {theme === 'light' ? <Moon /> : <SunMedium />}
          </button>
          {canWrite && (
            <>
              <button className="btn" onClick={() => setAwardOpen(true)} data-tour="new-award">
                <Plus /> New award
              </button>
              <button className="btn primary" onClick={() => setExpOpen(true)} data-tour="record-exp">
                <ReceiptText /> Record expenditure
              </button>
            </>
          )}
        </div>

        <div className="scroll-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="page"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ExpenditureModal open={expOpen} onClose={() => setExpOpen(false)} />
      <AwardModal open={awardOpen} onClose={() => setAwardOpen(false)} />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  )
}
