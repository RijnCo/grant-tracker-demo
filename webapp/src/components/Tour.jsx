import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../state/AppContext'

/**
 * First-run guided tour. Spotlights fixed shell elements (nav items, filters,
 * action buttons) one at a time with a short explanation. Steps whose target
 * is not on screen (e.g. writer-only buttons for read-only users) are skipped
 * automatically. Finishing or skipping sets localStorage so it only auto-runs
 * once per browser; the ? button in the top bar replays it.
 */
export const TOUR_DONE_KEY = 'pcg-tour-done'

const STEPS = [
  {
    target: null,
    title: 'Welcome to Grant Operations',
    body: 'This tracks every federal and state award the city holds — budgets, '
      + 'spending, amendments, and the audit-ready SEFA/SESFA schedules. '
      + 'A 30-second tour of where things live:',
  },
  {
    target: 'nav-grants',
    title: 'The grant portfolio',
    body: 'Every award, newest first — ordered by the date awarded, which often '
      + 'comes before the period of performance starts. Open any grant to see '
      + 'its ledger, documents, and amendments: that’s where you change '
      + 'period-of-performance dates or add funding when the grantor amends '
      + 'the award.',
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
      + 'reports on the SEFA (ALN number) or Florida’s SESFA (CSFA number '
      + 'plus the kind of state award — legislative appropriation, grant '
      + 'agreement, or revolving fund).',
  },
  {
    target: 'record-exp',
    title: 'Record spending',
    body: 'Post expenditures against an award. Database controls reject '
      + 'over-spending, out-of-year dates, and inconsistent subrecipient data — '
      + 'and every change lands in the append-only audit trail.',
  },
  {
    target: 'nav-funds',
    title: 'Operating funds',
    body: 'A simple tracker for the general operating funds — adopted budgets, '
      + 'revenues in, expenses out — kept separate from grant awards.',
  },
  {
    target: 'nav-sefa',
    title: 'SEFA report',
    body: 'The Schedule of Expenditures of Federal Awards: one line per federal '
      + 'program per year, with cluster totals and loan balances. Export CSV or '
      + 'print it for the single audit.',
  },
  {
    target: 'nav-sesfa',
    title: 'SESFA report',
    body: 'The same schedule for State of Florida assistance (Florida Single '
      + 'Audit Act): state agency, CSFA number, award type, and contract '
      + 'numbers.',
  },
  {
    target: 'search',
    title: 'Jump anywhere',
    body: 'Ctrl+K opens the command palette — type a page name or a grant to go '
      + 'straight to it.',
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
  if (!target) return null
  const el = document.querySelector(`[data-tour="${target}"]`)
  if (!el) return undefined // target absent (e.g. read-only role) -> skip step
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export default function Tour({ open, onClose }) {
  const { user } = useApp()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)

  const close = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    onClose()
  }, [onClose])

  // move to a step, skipping any whose target is missing from the DOM
  const goTo = useCallback((from, dir) => {
    let i = from
    while (i >= 0 && i < STEPS.length && findRect(STEPS[i].target) === undefined) i += dir
    if (i < 0 || i >= STEPS.length) return close()
    setStep(i)
  }, [close])

  useEffect(() => { if (open) setStep(0) }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => setRect(findRect(STEPS[step].target) || null)
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [open, step])

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
    const below = rect.top + rect.height + 240 < innerHeight
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
        {rect && (
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
        {!rect && <div className="tour-dim" />}
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
      </motion.div>
    </AnimatePresence>
  )
}
