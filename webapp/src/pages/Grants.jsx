import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Paperclip } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { docsFor } from '../lib/selectors'
import { downloadCsv, fmtFull, pctOf } from '../lib/format'
import { stateAwardTypeLabel } from '../lib/labels'
import DataTable from '../components/DataTable'
import SourceChip from '../components/SourceChip'
import UsageBar from '../components/UsageBar'

export default function Grants() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [source, setSource] = useState('ALL')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return data.awards.filter((a) =>
      (source === 'ALL' || a.funding_source === source) &&
      (!needle ||
        a.award_name.toLowerCase().includes(needle) ||
        (a.fain_or_ptin || '').toLowerCase().includes(needle) ||
        a.aln.includes(needle) ||
        (a.program_title || '').toLowerCase().includes(needle)))
  }, [data, q, source])

  const columns = [
    {
      key: 'award_name', label: 'Grant award',
      render: (a) => (
        <div>
          <div style={{ fontWeight: 550, display: 'flex', alignItems: 'center', gap: 7 }}>
            {a.award_name} <SourceChip source={a.funding_source} />
          </div>
          <div className="cell-sub">
            {a.fain_or_ptin} · {a.program_title}
            {a.funding_source === 'STATE'
              ? ' · ' + stateAwardTypeLabel(a.state_award_type)
              : a.pass_through_name ? ' · via ' + a.pass_through_name : ''}
          </div>
        </div>
      ),
    },
    { key: 'aln', label: 'ALN / CSFA' },
    {
      key: 'award_date', label: 'Awarded',
      render: (a) => a.award_date || '—',
    },
    {
      key: 'pop', label: 'Period of performance', sortValue: (a) => a.award_period_start || '',
      render: (a) => (
        <div>
          {a.award_period_start
            ? <>{a.award_period_start} <span style={{ color: 'var(--ink-3)' }}>→</span> {a.award_period_end}</>
            : '—'}
          {a.amendment_count > 0 && (
            <div className="cell-sub">{a.amendment_count} amendment{a.amendment_count === 1 ? '' : 's'}</div>
          )}
        </div>
      ),
    },
    {
      key: 'budget', label: 'Current award', numeric: true,
      render: (a) => (
        <div>
          {fmtFull(a.budget)}
          {a.budget !== a.original_amount && (
            <div className="cell-sub">was {fmtFull(a.original_amount)}</div>
          )}
        </div>
      ),
    },
    { key: 'spent', label: 'Spent to date', numeric: true, render: (a) => fmtFull(a.spent) },
    {
      key: 'remaining', label: 'Remaining', numeric: true,
      sortValue: (a) => (a.budget || 0) - a.spent,
      render: (a) => <span className="strong" style={{ fontWeight: 650 }}>{fmtFull((a.budget || 0) - a.spent)}</span>,
    },
    {
      key: 'pct', label: '% used', numeric: true,
      sortValue: (a) => pctOf(a.spent, a.budget || 0),
      render: (a) => <UsageBar pct={pctOf(a.spent, a.budget || 0)} />,
    },
    {
      key: 'docs', label: 'Docs', sortable: false,
      render: (a) => {
        const n = docsFor(data, a.award_id).length
        return (
          <span className="docs-chip">
            <Paperclip size={11} /> {n || '—'}
          </span>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Budget authority</div>
            <h2>All grant awards</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              Newest awards first — the award date often precedes the period of performance
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <span className="seg" role="group" aria-label="Funding source">
            {['ALL', 'FEDERAL', 'STATE'].map((v) => (
              <button key={v} aria-pressed={source === v} onClick={() => setSource(v)}>
                {v === 'ALL' ? 'All sources' : v === 'FEDERAL' ? 'Federal' : 'State'}
              </button>
            ))}
          </span>
          <input className="input" placeholder="Search grants…" value={q}
                 onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <button className="btn small" onClick={() =>
            downloadCsv(
              'grant-balances.csv',
              ['Grant award', 'Award number', 'ALN / CSFA', 'Program', 'Agency', 'Funding source',
               'State award type', 'Funding path', 'Pass-through entity', 'Awarded',
               'Period of performance start', 'Period of performance end', 'Amendments',
               'Original award', 'Current award', 'Spent to date', 'Remaining', '% used'],
              rows.map((a) => [
                a.award_name, a.fain_or_ptin, a.aln, a.program_title, a.agency_name,
                a.funding_source, a.state_award_type ? stateAwardTypeLabel(a.state_award_type) : '',
                a.funding_path, a.pass_through_name || '', a.award_date || '',
                a.award_period_start || '', a.award_period_end || '', a.amendment_count,
                a.original_amount, a.budget, a.spent,
                (a.budget || 0) - a.spent, pctOf(a.spent, a.budget || 0).toFixed(1),
              ]),
            )}>
            <Download /> Export CSV
          </button>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.award_id}
          initialSort={{ key: 'award_date', dir: -1 }}
          onRowClick={(a) => navigate(`/grants/${a.award_id}`)}
        />
      </div>
    </div>
  )
}
