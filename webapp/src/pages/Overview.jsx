import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { aggDepts, aggMonthly, aggSefa, expInScope } from '../lib/selectors'
import { fmtCompact, fmtFull, fmtWhole, pctOf } from '../lib/format'
import CountUp from '../components/CountUp'
import ProgramsChart from '../components/charts/ProgramsChart'
import DepartmentsChart from '../components/charts/DepartmentsChart'
import TrendChart from '../components/charts/TrendChart'
import UsageBar, { usageColor } from '../components/UsageBar'

const stagger = {
  hidden: { opacity: 0, y: 10 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] } }),
}

export default function Overview() {
  const { data, fy } = useApp()
  const exps = useMemo(() => expInScope(data, { fy }), [data, fy])
  const sefa = useMemo(() => aggSefa(exps), [exps])
  const depts = useMemo(() => aggDepts(exps), [exps])
  const monthly = useMemo(() => aggMonthly(exps), [exps])

  const total = exps.reduce((s, r) => s + r.amount, 0)
  const toSub = exps.reduce((s, r) => s + r.to_sub, 0)
  const fedTotal = exps.reduce((s, r) => s + (r.funding_source === 'FEDERAL' ? r.amount : 0), 0)
  const stateTotal = total - fedTotal
  const totalBudget = data.awards.reduce((s, a) => s + (a.budget || 0), 0)
  const totalSpent = data.awards.reduce((s, a) => s + a.spent, 0)
  const topGrants = [...data.awards]
    .sort((a, b) => ((b.budget || 0) - b.spent < (a.budget || 0) - a.spent ? -1 : 1))
    .slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <motion.div custom={0} variants={stagger} initial="hidden" animate="show">
        <div className="eyebrow">Grant expenditures · federal (SEFA) + state (SESFA)</div>
        <div className="hero-value">
          <CountUp value={total} format={fmtWhole} />
        </div>
        <div className="hero-sub">
          {(fy === 'ALL' ? 'All fiscal years' : fy)} · {sefa.length} programs ·{' '}
          {data.awards.length} awards · {fmtCompact(fedTotal)} federal + {fmtCompact(stateTotal)} state
        </div>
        <div className="hero-meta">
          {data.entity.auditee_name} · UEI {data.entity.auditee_uei} · EIN {data.entity.auditee_ein}
          {' · '}{data.entity.basis_of_accounting.toLowerCase().replace('_', ' ')} basis
          {' · '}data as of {data.generated_at}
        </div>
      </motion.div>

      <motion.div className="stats" custom={1} variants={stagger} initial="hidden" animate="show">
        <div className="stat">
          <div className="s-label">Remaining authority</div>
          <div className="s-value"><CountUp value={totalBudget - totalSpent} format={fmtCompact} /></div>
          <div className="s-note">of {fmtCompact(totalBudget)} awarded, all years</div>
        </div>
        <div className="stat">
          <div className="s-label">To subrecipients</div>
          <div className="s-value"><CountUp value={toSub} format={fmtCompact} /></div>
          <div className="s-note">{total ? ((100 * toSub) / total).toFixed(1) + '% of expenditures' : '—'}</div>
        </div>
        <div className="stat">
          <div className="s-label">Transactions in scope</div>
          <div className="s-value"><CountUp value={exps.length} /></div>
          <div className="s-note">{fy === 'ALL' ? 'all fiscal years' : fy}</div>
        </div>
        <div className="stat">
          <div className="s-label">Documents on file</div>
          <div className="s-value"><CountUp value={(data.documents || []).length} /></div>
          <div className="s-note">award letters, agreements, links</div>
        </div>
      </motion.div>

      <div className="grid">
        <motion.div className="card span-7" custom={2} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Schedule of expenditures</div>
          <h2>By assistance program</h2>
          <div className="c-sub">Amount retained vs. passed to subrecipients</div>
          <div className="legend">
            <span className="key"><span className="swatch" style={{ background: 'var(--series-1)' }} />Retained</span>
            <span className="key"><span className="swatch" style={{ background: 'var(--series-2)' }} />Passed to subrecipients</span>
          </div>
          <ProgramsChart rows={sefa} />
        </motion.div>

        <motion.div className="card span-5" custom={3} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Budget authority</div>
          <h2>Top grants by remaining balance</h2>
          <div className="c-sub">Cumulative, all years</div>
          {topGrants.map((a) => {
            const pct = pctOf(a.spent, a.budget || 0)
            return (
              <Link key={a.award_id} to={`/grants/${a.award_id}`}
                style={{ textDecoration: 'none', display: 'block', padding: '9px 0', borderTop: '1px solid var(--grid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 550 }}>{a.award_name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <b style={{ color: 'var(--ink)' }}>{fmtCompact((a.budget || 0) - a.spent)}</b> left
                  </span>
                </div>
                <div className="cellbar" style={{ width: '100%', marginTop: 6 }}>
                  <i style={{ transform: `scaleX(${pct / 100})`, background: usageColor(pct) }} />
                </div>
              </Link>
            )
          })}
          <Link to="/grants" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12,
            fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
          }}>
            All grants <ArrowUpRight size={13} />
          </Link>
        </motion.div>

        <motion.div className="card span-7" custom={4} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Cash flow</div>
          <h2>Monthly expenditure trend</h2>
          <div className="c-sub">Net of adjustments — refunds post as negatives</div>
          <TrendChart rows={monthly} />
        </motion.div>

        <motion.div className="card span-5" custom={5} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Internal allocation</div>
          <h2>Spending by department</h2>
          <div className="c-sub">From the trigger-maintained rollup</div>
          <DepartmentsChart rows={depts} />
        </motion.div>
      </div>
    </div>
  )
}
