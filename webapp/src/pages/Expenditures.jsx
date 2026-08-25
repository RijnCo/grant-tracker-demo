import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileOutput } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { expInScope } from '../lib/selectors'
import { downloadCsv, fmtFull } from '../lib/format'
import DataTable from '../components/DataTable'
import SourceChip from '../components/SourceChip'

export default function Expenditures() {
  const { data, fy, source } = useApp()
  const [q, setQ] = useState('')
  const [awardId, setAwardId] = useState('ALL')

  const rows = useMemo(() => {
    let r = expInScope(data, { fy, source, awardId: awardId === 'ALL' ? 'ALL' : Number(awardId) })
    const needle = q.trim().toLowerCase()
    if (needle) {
      r = r.filter((x) =>
        (x.description || '').toLowerCase().includes(needle) ||
        (x.doc_reference || '').toLowerCase().includes(needle) ||
        x.award_name.toLowerCase().includes(needle) ||
        (x.department_name || '').toLowerCase().includes(needle) ||
        (x.entered_by || '').toLowerCase().includes(needle))
    }
    return r
  }, [data, fy, source, awardId, q])

  const sumAmt = rows.reduce((s, r) => s + r.amount, 0)
  const sumSub = rows.reduce((s, r) => s + r.to_sub, 0)

  const exportCsv = () =>
    downloadCsv(
      'expenditure-register.csv',
      ['Date', 'Fiscal year', 'Grant award', 'Award number', 'ALN / CSFA', 'Funding source', 'Department', 'Description', 'Doc ref', 'Subrecipient', 'To subrecipient', 'Amount', 'Entered by'],
      rows.map((r) => [
        r.transaction_date, r.fy_label, r.award_name, r.fain_or_ptin, r.aln,
        r.funding_source, r.department_name || '', r.description || '', r.doc_reference || '',
        r.subrecipient_name || '', r.to_sub, r.amount, r.entered_by || '',
      ]),
    )

  // Journal-import layout for the city's OpenGov ERP: one line per
  // transaction, keyed by the award's internal GL account string.
  const exportOpenGov = () =>
    downloadCsv(
      'opengov-erp-journal.csv',
      ['Fiscal Year', 'Transaction Date', 'GL Account', 'Award Number', 'Funding Source',
       'Department', 'Vendor/Subrecipient', 'Description', 'Reference', 'Amount'],
      rows.map((r) => [
        r.fy_label, r.transaction_date, r.internal_gl_string || '', r.fain_or_ptin || '',
        r.funding_source === 'STATE' ? 'State' : 'Federal', r.department_name || '',
        r.subrecipient_name || '', r.description || '', r.doc_reference || '', r.amount,
      ]),
    )

  const columns = [
    { key: 'transaction_date', label: 'Date' },
    {
      key: 'award_name', label: 'Grant award',
      render: (r) => (
        <div>
          <Link to={`/grants/${r.award_id}`} style={{ textDecoration: 'none', fontWeight: 550 }}
                onClick={(e) => e.stopPropagation()}>
            {r.award_name}
          </Link>
          <div className="cell-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SourceChip source={r.funding_source} />
            {r.aln}{r.subrecipient_name ? ' · sub: ' + r.subrecipient_name : ''}
          </div>
        </div>
      ),
    },
    { key: 'department_name', label: 'Department', render: (r) => r.department_name || '—' },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    { key: 'doc_reference', label: 'Doc ref', render: (r) => r.doc_reference || '—' },
    {
      key: 'to_sub', label: 'To subrecipient', numeric: true,
      render: (r) => (r.to_sub ? fmtFull(r.to_sub) : '—'),
    },
    {
      key: 'amount', label: 'Amount', numeric: true,
      render: (r) => <span className={r.amount < 0 ? 'neg' : ''}>{fmtFull(r.amount)}</span>,
    },
    { key: 'entered_by', label: 'Entered by', render: (r) => r.entered_by || '—' },
  ]

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Transaction ledger</div>
          <h2>Expenditure register</h2>
          <div className="c-sub" style={{ marginBottom: 0 }}>
            {fy === 'ALL' ? 'All fiscal years' : fy} · click a column header to sort
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <select className="select" value={awardId} onChange={(e) => setAwardId(e.target.value)}
                aria-label="Filter by grant">
          <option value="ALL">All grants</option>
          {[...data.awards].sort((a, b) => a.award_name.localeCompare(b.award_name)).map((a) => (
            <option key={a.award_id} value={a.award_id}>{a.award_name}</option>
          ))}
        </select>
        <input className="input" placeholder="Search register…" value={q}
               onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <button className="btn small" onClick={exportCsv}><Download /> Export CSV</button>
        <button className="btn small" onClick={exportOpenGov} data-tour="opengov-export"
                title="Journal-import layout keyed by GL account">
          <FileOutput /> OpenGov ERP
        </button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.expenditure_id}
        initialSort={{ key: 'transaction_date', dir: -1 }}
        footer={[
          { content: `Total — ${rows.length} transaction${rows.length === 1 ? '' : 's'}`, colSpan: 5 },
          { content: fmtFull(sumSub), numeric: true },
          { content: fmtFull(sumAmt), numeric: true },
          { content: '' },
        ]}
      />
    </div>
  )
}
