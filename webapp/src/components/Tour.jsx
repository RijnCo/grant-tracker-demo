import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../state/AppContext'

/**
 * First-run guided tour. Walks through the whole suite — including navigating
 * to real pages (a grant's detail, the expenditure register, the audit trail)
 * and spotlighting the element being explained. Steps whose target never
 * appears (e.g. writer-only buttons for read-only users) are skipped
 * automatically. Finishing or skipping sets localStorage so it only auto-runs
 * once per browser; the ? button in the top bar replays it, and closing the
 * tour returns to wherever the user was.
 */
export const TOUR_DONE_KEY = 'pcg-tour-done'

const STEPS = [
  {
    target: null,
    title: 'Welcome to Grant Operations',
    body: 'This tracks every federal and state award the city holds — budgets, '
      + 'spending, amendments, and the audit-ready SEFA/SESFA schedules. '
      + 'A quick walk through the whole suite:',
  },
  {
    target: 'nav-overview',
    title: 'Overview',
    body: 'The headline numbers: total expenditures split federal vs. state, '
      + 'remaining budget authority, spending by program, department, and '
      + 'month. Everything respects the fiscal-year filter.',
  },
  {
    target: 'nav-grants',
    title: 'The grant portfolio',
    body: 'Every award, newest first — ordered by the date awarded, which often '
      + 'comes before the period of performance starts (awarded July 1, work '
      + 'begins in the fall).',
  },
  {
    route: '/grants', target: 'source-scope',
    title: 'Federal and state, side by side',
    body: 'One portfolio, two books: federal awards (ALN numbers, SEFA) and '
      + 'State of Florida assistance (CSFA numbers, SESFA). These tabs scope '
      + 'the overview, grants, expenditures, and agencies pages to either '
      + 'source — and every row carries a Federal or State chip.',
  },
  {
    route: '/grants/1', target: 'pop-stat',
    title: 'Period of performance',
    body: 'Each grant shows its awarded date and current period of performance. '
      + 'When a "3-year" award turns into a 6-year one, these dates move via '
      + 'amendments — never silent edits.',
  },
  {
    route: '/grants/1', target: 'amendments-card',
    title: 'Amendments',
    body: 'The modification history: extended dates, added funding, '
      + 'de-obligations. Recording an amendment updates the award’s '
      + 'current amount and dates, and the history itself is append-only — '
      + 'auditors see every version.',
  },
  {
    target: 'fy-filter',
    title: 'Fiscal year filter',
    body: 'Scopes every page to one fiscal year (October–September) or all of '
      + 'them. Reports like the SEFA and SESFA have their own per-year tabs.',
  },
  {
    target: 'new-award',
    title: 'Set up awards',
    body: 'Create a new award here. The Federal/State toggle decides whether it '
      + 'reports on the SEFA or Florida’s SESFA, including the kind of '
      + 'state award — legislative appropriation, grant agreement, or '
      + 'revolving fund.',
  },
  {
    target: 'record-exp',
    title: 'Record spending',
    body: 'Post expenditures against an award. Database controls reject '
      + 'over-spending, out-of-year dates, and inconsistent subrecipient '
      + 'data — balances update instantly.',
  },
  {
    route: '/expenditures', target: 'opengov-export',
    title: 'The expenditure register',
    body: 'Every transaction across all grants — searchable, sortable, CSV '
      + 'export. The OpenGov ERP button produces a journal-import file keyed '
      + 'by each award’s GL account string, ready for the city’s ERP.',
  },
  {
    target: 'nav-revenue',
    title: 'Revenue tracker',
    body: 'The Treasurer dashboard: every city revenue stream — property '
      + 'taxes, utility fees, state-shared revenue — budgeted per fiscal year '
      + 'and paced against a seasonal baseline. Streams that fall more than '
      + '10% behind raise automated alerts.',
  },
  {
    target: 'nav-funds',
    title: 'Operating funds',
    body: 'A simple tracker for the general operating funds — adopted budgets, '
      + 'revenues in, expenses out — kept separate from grant awards.',
  },
  {
    target: 'nav-cra',
    title: 'CRA districts',
    body: 'Community Redevelopment Agency tracking (Ch. 163, F.S.): each '
      + 'district’s tax base and TIF revenue, its funding sources, approved '
      + 'projects with budgets and spending, and the community engagement '
      + 'held for each project.',
  },
  {
    target: 'nav-directory',
    title: 'Directory',
    body: 'The people and entities money flows through: subrecipients (with '
      + 'UEIs for monitoring), city departments, and pass-through agencies. '
      + 'Add them here or straight from the entry forms.',
  },
  {
    route: '/audit', target: 'audit-log',
    title: 'The transaction log',
    body: 'Database triggers write every insert, update, and delete to an '
      + 'append-only audit log — old and new values, the award balance before '
      + 'and after, who did it, and when. The log rejects edits and deletes, '
      + 'and sign-ins are recorded too.',
  },
  {
    target: 'nav-sefa',
    title: 'SEFA report',
    body: 'The Schedule of Expenditures of Federal Awards: one line per federal '
      + 'program per year, with cluster totals and loan balances. Export CSV '
      + 'or print it for the single audit.',
  },
  {
    target: 'nav-sesfa',
    title: 'SESFA report',
    body: 'The same schedule for State of Florida assistance under the Florida '
      + 'Single Audit Act: state agency, CSFA number, award type, and '
      + 'contract numbers.',
  },
  {
    target: 'search',
    title: 'Jump anywhere',
    body: 'Ctrl+K opens the command palette — type a page name or a grant to '
      + 'go straight to it.',
  },
  {
    target: null,
    title: 'That’s the whole loop',
    body: 'Set up the award, record spending, amend when dates or amounts '
      + 'change, and hand the auditors the SEFA and SESFA. Replay this tour '
      + 'anytime with the ? button in the top bar.',
  },
]

const findRect = (target) => {
  if (!target) return null // centered step
  const el = document.querySelector(`[data-tour="${target}"]`)
  if (!el) return undefined // not on screen (yet)
  el.scrollIntoView({ block: 'nearest' })
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export default function Tour({ open, onClose }) {
  const { user } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)
  const dirRef = useRef(1)
  const homeRef = useRef('/')
  const wasOpenRef = useRef(false)

  const close = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    onClose()
  }, [onClose])

  const goTo = useCallback((i, dir) => {
    dirRef.current = dir
    if (i < 0 || i >= STEPS.length) return close()
    setStep(i)
  }, [close])

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      homeRef.current = location.pathname
      dirRef.current = 1
      setStep(0)
      setReady(false)
    } else if (wasOpenRef.current) {
      // leave the user where the tour found them
      wasOpenRef.current = false
      navigate(homeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // navigate (if the step lives on another page), then find + track the target
  useEffect(() => {
    if (!open) return
    const s = STEPS[step]
    if (s.route && location.pathname !== s.route) {
      navigate(s.route)
      return // effect re-runs once location catches up
    }
    let cancelled = false
    let tries = 0
    const measure = () => {
      if (cancelled) return
      const r = findRect(s.target)
      if (r !== undefined) {
        setRect(r)
        setReady(true)
        return
      }
      if (++tries > 10) {
        // target never appeared (e.g. writer-only button) -> skip the step
        goTo(step + dirRef.current, dirRef.current)
        return
      }
      setTimeout(measure, 140)
    }
    setReady(false)
    // let the page-transition animation settle before the first measurement
    const t = setTimeout(measure, s.route ? 320 : 60)
    const remeasure = () => { const r = findRect(s.target); if (r !== undefined) setRect(r) }
    addEventListener('resize', remeasure)
    addEventListener('scroll', remeasure, true)
    return () => {
      cancelled = true
      clearTimeout(t)
      removeEventListener('resize', remeasure)
      removeEventListener('scroll', remeasure, true)
    }
  }, [open, step, location.pathname, navigate, goTo])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') goTo(step + 1, 1)
      else if (e.key === 'ArrowLeft') goTo(step - 1, -1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, step, goTo, close])

  if (!open) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  // card position: centered for untargeted steps, otherwise near the target
  let cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  if (rect) {
    const below = rect.top + rect.height + 260 < innerHeight
    cardStyle = {
      top: below ? rect.top + rect.height + 14 : undefined,
      bottom: below ? undefined : innerHeight - rect.top + 14,
      left: Math.max(14, Math.min(rect.left, innerWidth - 374)),
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="tour-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        aria-modal="true" role="dialog" aria-label="Product tour"
      >
        {rect && ready && (
          <motion.div
            className="tour-highlight"
            initial={false}
            animate={{
              top: rect.top - 6, left: rect.left - 6,
              width: rect.width + 12, height: rect.height + 12,
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        {(!rect || !ready) && <div className="tour-dim" />}
        {ready && (
          <motion.div
            key={step}
            className="tour-card"
            style={cardStyle}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tour-count">
              {step + 1} of {STEPS.length}
              {user?.role === 'viewer' && step === 0 ? ' · read-only account' : ''}
            </div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <div className="tour-actions">
              <button className="btn small ghost" onClick={close}>
                {last ? 'Close' : 'Skip tour'}
              </button>
              <div style={{ flex: 1 }} />
              {step > 0 && (
                <button className="btn small" onClick={() => goTo(step - 1, -1)}>Back</button>
              )}
              {!last && (
                <button className="btn small primary" onClick={() => goTo(step + 1, 1)}>Next</button>
              )}
              {last && (
                <button className="btn small primary" onClick={close}>Done</button>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
