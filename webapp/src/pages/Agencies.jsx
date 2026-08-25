import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { aggAgencies, expInScope } from '../lib/selectors'
import { fmtCompact, fmtFull, pctOf } from '../lib/format'
import DataTable from '../components/DataTable'
import SourceChip from '../components/SourceChip'
import UsageBar from '../components/UsageBar'

export default function Agencies() {
  const { data, fy } = useApp()
  const exps = useMemo(() => expInScope(data, { fy }), [data, fy])
  const agencies = useMemo(() => aggAgencies(data, exps), [data, exps])
  const grandTotal = agencies.reduce((s, a) => s + a.total, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="eyebrow">Funding sources</div>
        <div className="hero-value" style={{ fontSize: 28 }}>
          {agencies.length} awarding agencies
        </div>
        <div className="hero-sub">
          {fmtCompact(grandTotal)} expended {fy === 'ALL' ? 'across all fiscal years' : 'in ' + fy}
          {' '}— every agency, the programs it funds, and the grants it gave
        </div>
      </div>

      {agencies.map((ag, i) => {
        const awards = data.awards.filter((a) => a.agency_name === ag.agency_name)
        const share = grandTotal ? (100 * ag.total) / grandTotal : 0
        return (
          <motion.div className="card" key={ag.agency_name}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="doc-ico" style={{ width: 36, height: 36 }}><Building2 /></div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {ag.agency_name} <SourceChip source={ag.funding_source} />
                </h2>
                <div className="c-sub" style={{ marginBottom: 0 }}>
                  {ag.programs.length} program{ag.programs.length === 1 ? '' : 's'} ·{' '}
                  {ag.awardCount} grant{ag.awardCount === 1 ? '' : 's'} with activity ·{' '}
                  {fmtCompact(ag.to_sub)} passed to subrecipients
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 21, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtFull(ag.total)}
                </div>
                <div className="c-sub" style={{ marginBottom: 0 }}>{share.toFixed(1)}% of all spending</div>
              </div>
            </div>
            <div className="cellbar" style={{ width: '100%', marginTop: 10, height: 6 }}>
              <i style={{ transform: `scaleX(${share / 100})`, background: 'var(--series-1)' }} />
            </div>
            <div style={{ marginTop: 14 }}>
              <DataTable
                columns={[
                  {
                    key: 'award_name', label: 'Grant award',
                    render: (a) => (
                      <div>
                        <Link to={`/grants/${a.award_id}`} style={{ textDecoration: 'none', fontWeight: 550 }}>
                          {a.award_name}
                        </Link>
                        <div className="cell-sub">{a.fain_or_ptin} · {a.aln} {a.program_title}</div>
                      </div>
                    ),
                  },
                  { key: 'budget', label: 'Original award', numeric: true, render: (a) => fmtFull(a.budget) },
                  { key: 'spent', label: 'Spent to date', numeric: true, render: (a) => fmtFull(a.spent) },
                  {
                    key: 'remaining', label: 'Remaining', numeric: true,
                    sortValue: (a) => (a.budget || 0) - a.spent,
                    render: (a) => <b>{fmtFull((a.budget || 0) - a.spent)}</b>,
                  },
                  {
                    key: 'pct', label: '% used', numeric: true,
                    sortValue: (a) => pctOf(a.spent, a.budget || 0),
                    render: (a) => <UsageBar pct={pctOf(a.spent, a.budget || 0)} width={70} />,
                  },
                ]}
                rows={awards}
                rowKey={(a) => a.award_id}
                initialSort={{ key: 'spent', dir: -1 }}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
