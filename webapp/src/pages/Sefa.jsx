import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { aggSefa, expInScope } from '../lib/selectors'
import { downloadCsv, fmtFull } from '../lib/format'
import DataTable from '../components/DataTable'

/** The SEFA is a per-fiscal-year statement, so this page has its own FY tabs. */
export default function Sefa() {
  const { data } = useApp()
  const years = data.fiscal_years.map((f) => f.fy_label)
  const [year, setYear] = useState(years[years.length - 1])

  // federal awards only — state financial assistance is on the SESFA page
  const exps = useMemo(() => expInScope(data, { fy: year, source: 'FEDERAL' }), [data, year])
  const sefa = useMemo(() => aggSefa(exps), [exps])
  const clusters = useMemo(() => {
    const m = new Map()
    for (const r of sefa) {
      if (!r.cluster_name) continue
      const cur = m.get(r.cluster_name) || { cluster_name: r.cluster_name, total: 0, to_sub: 0 }
      cur.total += r.total
      cur.to_sub += r.to_sub
      m.set(r.cluster_name, cur)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [sefa])

  const total = sefa.reduce((s, r) => s + r.total, 0)
  const toSub = sefa.reduce((s, r) => s + r.to_sub, 0)
  const federalIds = useMemo(
    () => new Set(data.awards.filter((a) => a.funding_source === 'FEDERAL').map((a) => a.award_id)),
    [data])
  const loans = data.loan_balances.filter((l) => l.fy_label === year && federalIds.has(l.award_id))
  const yearEnd = data.fiscal_years.find((f) => f.fy_label === year)?.end_date

  const exportCsv = () =>
    downloadCsv(
      `SEFA-${year}.csv`,
      ['ALN', 'Program', 'Federal agency', 'Cluster', 'Total expenditures', 'Passed to subrecipients'],
      sefa.map((r) => [r.aln, r.program_title, r.agency_name, r.cluster_name || '', r.total, r.to_sub]),
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* formal header, shown only on the printed report */}
      <div className="print-only report-header">
        <div className="rh-entity">{data.entity.auditee_name}</div>
        <div className="rh-title">Schedule of Expenditures of Federal Awards</div>
        <div className="rh-sub">For the Fiscal Year Ended {yearEnd}</div>
        <div className="rh-meta">
          UEI {data.entity.auditee_uei} · EIN {data.entity.auditee_ein} ·{' '}
          {data.entity.basis_of_accounting.toLowerCase().replace('_', ' ')} basis of accounting
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">2 CFR 200.510(b)</div>
          <div className="hero-value" style={{ fontSize: 28 }}>
            Schedule of Expenditures of Federal Awards
          </div>
          <div className="hero-sub">
            {data.entity.auditee_name} · year ended {yearEnd}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="seg" role="group" aria-label="SEFA fiscal year">
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
        <h2>Federal programs</h2>
        <div className="c-sub">One line per program; clusters identified per 200.510(b)(1)</div>
        <DataTable
          columns={[
            { key: 'aln', label: 'ALN' },
            { key: 'program_title', label: 'Program' },
            { key: 'agency_name', label: 'Federal agency' },
            { key: 'cluster_name', label: 'Cluster', render: (r) => r.cluster_name || '—' },
            { key: 'total', label: 'Total expenditures', numeric: true, render: (r) => fmtFull(r.total) },
            { key: 'to_sub', label: 'To subrecipients', numeric: true, render: (r) => fmtFull(r.to_sub) },
          ]}
          rows={sefa}
          rowKey={(r) => r.aln + r.program_title}
          initialSort={{ key: 'aln', dir: 1 }}
          footer={[
            { content: 'Total federal expenditures', colSpan: 4 },
            { content: fmtFull(total), numeric: true },
            { content: fmtFull(toSub), numeric: true },
          ]}
        />
      </div>

      <div className="grid">
        {clusters.length > 0 && (
          <div className="card span-6">
            <div className="eyebrow">200.510(b)(1)</div>
            <h2>Cluster totals</h2>
            <div className="c-sub">Clusters are audited as one program</div>
            <DataTable
              columns={[
                { key: 'cluster_name', label: 'Cluster' },
                { key: 'total', label: 'Total', numeric: true, render: (r) => fmtFull(r.total) },
                { key: 'to_sub', label: 'To subrecipients', numeric: true, render: (r) => fmtFull(r.to_sub) },
              ]}
              rows={clusters}
              rowKey={(r) => r.cluster_name}
            />
          </div>
        )}
        {loans.length > 0 && (
          <div className="card span-6">
            <div className="eyebrow">200.510(b)(5)</div>
            <h2>Loan balances outstanding</h2>
            <div className="c-sub">At {year} fiscal year end</div>
            <DataTable
              columns={[
                { key: 'award_name', label: 'Award' },
                { key: 'aln', label: 'ALN' },
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
