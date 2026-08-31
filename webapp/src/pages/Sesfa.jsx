import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { aggSesfa, expInScope } from '../lib/selectors'
import { downloadCsv, fmtFull } from '../lib/format'
import { stateAwardTypeLabel } from '../lib/labels'
import DataTable from '../components/DataTable'

/**
 * SESFA — Schedule of Expenditures of State Financial Assistance, required by
 * the Florida Single Audit Act (s. 215.97, F.S.) and Auditor General Rule
 * 10.550. Same shape as the SEFA, but state agencies and CSFA numbers.
 */
export default function Sesfa() {
  const { data } = useApp()
  const years = data.fiscal_years.map((f) => f.fy_label)
  const [year, setYear] = useState(years[years.length - 1])

  const exps = useMemo(() => expInScope(data, { fy: year, source: 'STATE' }), [data, year])
  const sesfa = useMemo(() => aggSesfa(exps), [exps])

  const total = sesfa.reduce((s, r) => s + r.total, 0)
  const toSub = sesfa.reduce((s, r) => s + r.to_sub, 0)
  const stateIds = useMemo(
    () => new Set(data.awards.filter((a) => a.funding_source === 'STATE').map((a) => a.award_id)),
    [data])
  const loans = data.loan_balances.filter((l) => l.fy_label === year && stateIds.has(l.award_id))
  const byType = useMemo(() => {
    const m = new Map()
    for (const r of sesfa) {
      const k = r.state_award_type || 'other'
      m.set(k, (m.get(k) || 0) + r.total)
    }
    return [...m.entries()].map(([k, v]) => ({ type: k, total: v }))
      .sort((a, b) => b.total - a.total)
  }, [sesfa])
  const yearEnd = data.fiscal_years.find((f) => f.fy_label === year)?.end_date

  const exportCsv = () =>
    downloadCsv(
      `SESFA-${year}.csv`,
      ['State agency', 'CSFA number', 'State program', 'Award type',
       'Contract / grant number', 'Total expenditures', 'To subrecipients'],
      sesfa.map((r) => [
        r.agency_name, r.csfa, r.program_title, stateAwardTypeLabel(r.state_award_type),
        r.contracts, r.total, r.to_sub,
      ]),
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* formal header, shown only on the printed report */}
      <div className="print-only report-header">
        <div className="rh-entity">{data.entity.auditee_name}</div>
        <div className="rh-title">Schedule of Expenditures of State Financial Assistance</div>
        <div className="rh-sub">For the Fiscal Year Ended {yearEnd}</div>
        <div className="rh-meta">
          Florida Single Audit Act, Section 215.97, Florida Statutes ·{' '}
          {data.entity.basis_of_accounting.toLowerCase().replace('_', ' ')} basis of accounting
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Section 215.97, Florida Statutes</div>
          <div className="hero-value" style={{ fontSize: 28 }}>
            Schedule of Expenditures of State Financial Assistance
          </div>
          <div className="hero-sub">
            {data.entity.auditee_name} · year ended {yearEnd}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="seg" role="group" aria-label="SESFA fiscal year">
          {years.map((y) => (
            <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>
          ))}
        </span>
        <button className="btn small" onClick={exportCsv}><Download /> Export CSV</button>
        <button className="btn small primary" onClick={() => window.print()}>
          <Printer /> Print report
        </button>
      </div>

      <div className="card">
        <div className="eyebrow">{year}</div>
        <h2>State financial assistance</h2>
        <div className="c-sub">
          One line per state project, identified by CSFA number (Catalog of State Financial Assistance)
        </div>
        <DataTable
          columns={[
            { key: 'agency_name', label: 'State agency' },
            { key: 'csfa', label: 'CSFA' },
            { key: 'program_title', label: 'State program' },
            {
              key: 'state_award_type', label: 'Award type',
              render: (r) => stateAwardTypeLabel(r.state_award_type),
            },
            { key: 'contracts', label: 'Contract / grant #', render: (r) => r.contracts || '—' },
            { key: 'total', label: 'Total expenditures', numeric: true, render: (r) => fmtFull(r.total) },
            { key: 'to_sub', label: 'To subrecipients', numeric: true, render: (r) => fmtFull(r.to_sub) },
          ]}
          rows={sesfa}
          rowKey={(r) => r.csfa + r.program_title}
          initialSort={{ key: 'csfa', dir: 1 }}
          footer={[
            { content: 'Total state financial assistance', colSpan: 5 },
            { content: fmtFull(total), numeric: true },
            { content: fmtFull(toSub), numeric: true },
          ]}
        />
      </div>

      <div className="grid">
        {byType.length > 0 && (
          <div className="card span-6">
            <div className="eyebrow">Assistance mix</div>
            <h2>By state award type</h2>
            <div className="c-sub">Legislative appropriations, grant agreements, revolving funds</div>
            <DataTable
              columns={[
                { key: 'type', label: 'Award type', render: (r) => stateAwardTypeLabel(r.type) },
                { key: 'total', label: 'Total', numeric: true, render: (r) => fmtFull(r.total) },
              ]}
              rows={byType}
              rowKey={(r) => r.type}
            />
          </div>
        )}
        {loans.length > 0 && (
          <div className="card span-6">
            <div className="eyebrow">Revolving fund loans</div>
            <h2>Loan balances outstanding</h2>
            <div className="c-sub">At {year} fiscal year end</div>
            <DataTable
              columns={[
                { key: 'award_name', label: 'Award' },
                { key: 'aln', label: 'CSFA' },
                { key: 'outstanding_balance', label: 'Balance', numeric: true, render: (r) => fmtFull(r.outstanding_balance) },
              ]}
              rows={loans}
              rowKey={(r) => r.award_id + r.fy_label}
            />
          </div>
        )}
      </div>

      <div className="print-only report-footer">
        Prepared from the City of Panama City grant accounting system · generated {data.generated_at}
      </div>
    </div>
  )
}
