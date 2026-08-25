import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Landmark, Table2, Building2, Users, ShieldCheck, FileSpreadsheet,
  ScrollText, Wallet, ArrowRight,
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { fmtCompact } from '../lib/format'

const PAGES = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Grants', to: '/grants', icon: Landmark },
  { label: 'Expenditures', to: '/expenditures', icon: Table2 },
  { label: 'Operating funds', to: '/funds', icon: Wallet },
  { label: 'Agencies', to: '/agencies', icon: Building2 },
  { label: 'Directory', to: '/directory', icon: Users },
  { label: 'Audit trail', to: '/audit', icon: ShieldCheck },
  { label: 'SEFA report', to: '/sefa', icon: FileSpreadsheet },
  { label: 'SESFA report', to: '/sesfa', icon: ScrollText },
]

export default function CommandPalette({ open, onClose }) {
  const { data } = useApp()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages = PAGES.filter((p) => !needle || p.label.toLowerCase().includes(needle))
      .map((p) => ({ type: 'page', ...p }))
    const grants = (data?.awards || [])
      .filter((a) =>
        !needle ||
        a.award_name.toLowerCase().includes(needle) ||
        (a.fain_or_ptin || '').toLowerCase().includes(needle) ||
        a.aln.includes(needle))
      .slice(0, 8)
      .map((a) => ({
        type: 'grant', label: a.award_name, to: `/grants/${a.award_id}`,
        icon: Landmark, sub: a.aln + ' · ' + fmtCompact((a.budget || 0) - a.spent) + ' left',
      }))
    return [...pages, ...grants]
  }, [q, data])

  useEffect(() => { setSel(0) }, [items.length])

  const go = (item) => {
    if (!item) return
    navigate(item.to)
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[sel]) }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          style={{ alignItems: 'flex-start' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            className="palette"
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Jump to a page or search grants…"
              aria-label="Command palette"
            />
            <div className="plist">
              {items.length === 0 && <div className="pempty">No matches.</div>}
              {items.map((item, i) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.type + item.to}
                    className={'pitem' + (i === sel ? ' sel' : '')}
                    onPointerEnter={() => setSel(i)}
                    onClick={() => go(item)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                    {item.sub
                      ? <span className="p-sub">{item.sub}</span>
                      : <span className="p-sub"><ArrowRight size={12} /></span>}
                  </div>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { PAGES }
