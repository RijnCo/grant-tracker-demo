import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Download, FileUp, Plus, ReceiptText } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { downloadCsv, fmtCompact, fmtFull } from '../lib/format'
import { REVENUE_FUND_TYPES, revenueFundTypeLabel } from '../lib/labels'
import { FUND_COLORS, pacingRows, sharesByStream } from '../lib/revenue'
import CountUp from '../components/CountUp'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import PacingChart from '../components/charts/PacingChart'
import TreemapChart from '../components/charts/TreemapChart'

const stagger = {
  hidden: { opacity: 0, y: 10 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] } }),
}

const paceStatus = (s) => {
  if (s.expected_share < 0.05) return { label: 'Too early', tone: 'var(--ink-3)' }
  if (s.variance_to_baseline_pct <= -10) return { label: 'Behind', tone: 'var(--critical)' }
  if (s.variance_to_baseline_pct <= -3) return { label: 'Watch', tone: 'var(--warning)' }
  return { label: 'On track', tone: 'var(--good)' }
}

function streamOptions(streams) {
  return Object.keys(REVENUE_FUND_TYPES).map((ft) => (
    <optgroup key={ft} label={revenueFundTypeLabel(ft)}>
      {streams.filter((s) => s.fund_type === ft).map((s) => (
        <option key={s.stream_id} value={s.stream_id}>
          {s.account_code} — {s.stream_name}
        </option>
      ))}
    </optgroup>
  ))
}

function ReceiptModal({ open, onClose, streams }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/revenue-receipt', {
        method: 'POST',
        body: JSON.stringify({
          stream_id: f.get('stream_id'),
          amount: f.get('amount'),
          receipt_date: f.get('receipt_date'),
          description: f.get('description'),
          doc_reference: f.get('doc_reference'),
          is_adjustment: f.get('is_adjustment') === 'on',
        }),
      })
      toast(`Recorded — ${r.stream_name} now ${fmtFull(r.ytd)} for the year.`)
      if (r.alert) toast(r.alert.message, true)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    }
  }
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>Record revenue receipt</h3>
        <div className="m-sub">
          The fiscal year is derived from the receipt date; the stream's pacing
          is re-checked against its seasonal baseline on save.
        </div>
        <label htmlFor="rr-stream">Revenue stream</label>
        <select id="rr-stream" name="stream_id" required>{streamOptions(streams)}</select>
        <div className="row2">
          <div>
            <label htmlFor="rr-amount">Amount ($)</label>
            <input id="rr-amount" name="amount" type="number" step="0.01" required />
          </div>
          <div>
            <label htmlFor="rr-date">Receipt date</label>
            <input id="rr-date" name="receipt_date" type="date" required />
          </div>
        </div>
        <label htmlFor="rr-desc">Description</label>
        <input id="rr-desc" name="description" placeholder="FDOR monthly distribution (ACH)" />
        <div className="row2">
          <div>
            <label htmlFor="rr-ref">Doc reference (optional)</label>
            <input id="rr-ref" name="doc_reference" placeholder="RCV-00123" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <input type="checkbox" name="is_adjustment" style={{ width: 'auto' }} />
              Adjustment / refund
            </label>
          </div>
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Record</button>
        </div>
      </form>
    </Modal>
  )
}

function StreamModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/revenue-stream', {
        method: 'POST',
        body: JSON.stringify({
          account_code: f.get('account_code'),
          stream_name: f.get('stream_name'),
          fund_type: f.get('fund_type'),
          collector: f.get('collector'),
          fiscal_year_id: f.get('fiscal_year_id'),
          budgeted_amount: f.get('budgeted_amount'),
        }),
      })
      toast(`Added revenue stream "${r.stream_name}".`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    }
  }
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>New revenue stream</h3>
        <div className="m-sub">
          Mapped to the chart of accounts; collections pace uniformly until a
          seasonal curve is loaded for it.
        </div>
        <div className="row2">
          <div>
            <label htmlFor="rs-code">Account code</label>
            <input id="rs-code" name="account_code" required placeholder="316.000" />
          </div>
          <div>
            <label htmlFor="rs-fund">Fund type</label>
            <select id="rs-fund" name="fund_type" defaultValue="general">
              {Object.entries(REVENUE_FUND_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="rs-name">Stream name</label>
        <input id="rs-name" name="stream_name" required placeholder="Insurance Premium Taxes" />
        <label htmlFor="rs-collector">Collected by</label>
        <input id="rs-collector" name="collector" placeholder="Florida DOR clearinghouse" />
        <div className="row2">
          <div>
            <label htmlFor="rs-fy">Budget fiscal year</label>
            <select id="rs-fy" name="fiscal_year_id">
              {(data.fiscal_years || []).map((fy) => (
                <option key={fy.fiscal_year_id} value={fy.fiscal_year_id}>{fy.fy_label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rs-budget">Budgeted amount ($)</label>
            <input id="rs-budget" name="budgeted_amount" type="number" step="0.01" min="1" required />
          </div>
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Add stream</button>
        </div>
      </form>
    </Modal>
  )
}

// Minimal CSV parser with quoted-field support.
function parseCsv(text) {
  const parseLine = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ } else q = false
        } else cur += ch
      } else if (ch === '"') q = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out
  }
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { header: [], rows: [] }
  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows = lines.slice(1).map((l) => {
    const vals = parseLine(l)
    return Object.fromEntries(header.map((h, i) => [h, (vals[i] || '').trim()]))
  })
  return { header, rows }
}

function ImportModal({ open, onClose }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setErr(''); setText(''); onClose() }
  const parsed = useMemo(() => parseCsv(text), [text])
  const needed = ['receipt_date', 'account_code', 'amount']
  const missing = text.trim() ? needed.filter((c) => !parsed.header.includes(c)) : []

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result || ''))
    reader.readAsText(file)
  }
  const submit = async (e) => {
    e.preventDefault()
    if (missing.length || parsed.rows.length === 0) return
    setErr('')
    setBusy(true)
    try {
      const r = await api('/api/revenue-import', {
        method: 'POST',
        body: JSON.stringify({ rows: parsed.rows }),
      })
      toast(`Imported ${r.inserted} receipts across ${r.streams} streams.`)
      for (const a of r.alerts || []) toast(a.message, true)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>Import deposits (CSV)</h3>
        <div className="m-sub">
          Bank lockbox or clearinghouse files. Columns: <b>receipt_date</b>,{' '}
          <b>account_code</b>, <b>amount</b>, and optionally description and
          doc_reference. The batch is all-or-nothing: any bad row rejects the
          whole file.
        </div>
        <label htmlFor="ri-file">CSV file</label>
        <input id="ri-file" type="file" accept=".csv,text/csv" onChange={onFile} />
        <label htmlFor="ri-text">…or paste rows</label>
        <textarea id="ri-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'receipt_date,account_code,amount,description\n2026-08-25,311.000,145000.00,Tax collector remittance'}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        <div className="c-sub" style={{ marginTop: 6 }}>
          {!text.trim() ? 'Nothing loaded yet.'
            : missing.length ? `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
            : `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} ready to import.`}
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary"
                  disabled={busy || !!missing.length || parsed.rows.length === 0}>
            {busy ? 'Importing…' : 'Import batch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Treasurer revenue tracker: budget vs. actual pacing per revenue stream. */
export default function Revenue() {
  const { data, fy, canWrite } = useApp()
  const [q, setQ] = useState('')
  const [fundType, setFundType] = useState('ALL')
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [streamOpen, setStreamOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const asOf = (data.generated_at || '').slice(0, 10)
  // The tracker is fiscal-year based: 'ALL' means the FY that contains today.
  const fyRow = useMemo(() => {
    const list = data.fiscal_years || []
    if (fy !== 'ALL') return list.find((f) => f.fy_label === fy)
    return list.find((f) => asOf >= f.start_date && asOf <= f.end_date) || list[list.length - 1]
  }, [data, fy, asOf])
  const fyLabel = fyRow?.fy_label

  const status = useMemo(
    () => (data.revenue_status || []).filter((s) => s.fy_label === fyLabel),
    [data, fyLabel])
  const receipts = useMemo(
    () => (data.revenue_receipts || []).filter((r) => r.fy_label === fyLabel),
    [data, fyLabel])
  const alerts = useMemo(
    () => (data.revenue_alerts || []).filter((a) => a.fy_label === fyLabel),
    [data, fyLabel])
  const sharesMap = useMemo(() => sharesByStream(data.revenue_seasonality), [data])
  const pacing = useMemo(
    () => (fyRow ? pacingRows(status, receipts, sharesMap, fyRow, asOf) : []),
    [status, receipts, sharesMap, fyRow, asOf])

  const budget = status.reduce((s, r) => s + r.budgeted_amount, 0)
  const collected = status.reduce((s, r) => s + r.actual_amount, 0)
  const expected = status.reduce((s, r) => s + r.expected_to_date, 0)
  const behind = status.filter((s) => s.expected_share >= 0.05 && s.variance_to_baseline_pct <= -10)
  const runRate = expected > 0 ? (100 * collected) / expected : 0
  const notStarted = fyRow && asOf < fyRow.start_date

  const streamsSorted = useMemo(
    () => [...status].sort((a, b) => a.variance_to_baseline_pct - b.variance_to_baseline_pct),
    [status])

  const ledger = useMemo(() => {
    let r = receipts
    if (fundType !== 'ALL') r = r.filter((t) => t.fund_type === fundType)
    const needle = q.trim().toLowerCase()
    if (needle) {
      r = r.filter((t) =>
        t.stream_name.toLowerCase().includes(needle) ||
        t.account_code.includes(needle) ||
        (t.description || '').toLowerCase().includes(needle) ||
        (t.doc_reference || '').toLowerCase().includes(needle))
    }
    return r
  }, [receipts, fundType, q])

  const allStreams = useMemo(() => {
    const seen = new Map()
    for (const s of data.revenue_status || []) {
      if (!seen.has(s.stream_id)) seen.set(s.stream_id, s)
    }
    return [...seen.values()].sort((a, b) => a.account_code.localeCompare(b.account_code))
  }, [data])

  const treemapItems = status.map((s) => ({
    name: s.stream_name,
    value: notStarted ? s.budgeted_amount : s.actual_amount,
    color: FUND_COLORS[s.fund_type],
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <motion.div custom={0} variants={stagger} initial="hidden" animate="show"
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">City revenue · budget vs. actual pacing</div>
          <div className="hero-value"><CountUp value={collected} format={fmtFull} /></div>
          <div className="hero-sub">
            collected in {fyLabel}{fy === 'ALL' ? ' (current year)' : ''} ·{' '}
            {fmtCompact(budget)} budget target · {status.length} revenue streams
            {notStarted ? ' · fiscal year has not started' : ''}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <>
            <button className="btn small" onClick={() => setStreamOpen(true)}>
              <Plus /> New stream
            </button>
            <button className="btn small" onClick={() => setImportOpen(true)}>
              <FileUp /> Import CSV
            </button>
            <button className="btn small primary" onClick={() => setReceiptOpen(true)}>
              <ReceiptText /> Record receipt
            </button>
          </>
        )}
      </motion.div>

      <motion.div className="stats" custom={1} variants={stagger} initial="hidden" animate="show">
        <div className="stat">
          <div className="s-label">Budget target ({fyLabel})</div>
          <div className="s-value"><CountUp value={budget} format={fmtCompact} /></div>
          <div className="s-note">adopted across all streams</div>
        </div>
        <div className="stat">
          <div className="s-label">Collected vs. budget</div>
          <div className="s-value">{budget ? ((100 * collected) / budget).toFixed(1) + '%' : '—'}</div>
          <div className="s-note">{fmtCompact(collected)} of {fmtCompact(budget)}</div>
        </div>
        <div className="stat">
          <div className="s-label">Run rate vs. baseline</div>
          <div className="s-value" style={{ color: runRate < 90 && !notStarted ? 'var(--critical)' : undefined }}>
            {notStarted ? '—' : runRate.toFixed(1) + '%'}
          </div>
          <div className="s-note">
            {notStarted ? 'starts ' + fyRow.start_date : fmtCompact(expected) + ' expected by today'}
          </div>
        </div>
        <div className="stat">
          <div className="s-label">Streams behind &gt;10%</div>
          <div className="s-value" style={{ color: behind.length ? 'var(--critical)' : undefined }}>
            <CountUp value={behind.length} />
          </div>
          <div className="s-note">{alerts.length} alert{alerts.length === 1 ? '' : 's'} on the log</div>
        </div>
      </motion.div>

      {alerts.length > 0 && (
        <motion.div className="card" custom={2} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Automated alerts</div>
          <h2>Revenue pacing alerts</h2>
          <div className="c-sub">
            Raised automatically when a stream falls more than 10% behind its
            seasonal baseline — the early-warning list for deficit trends
          </div>
          {alerts.map((a) => (
            <div key={a.alert_id} style={{ display: 'flex', gap: 10, padding: '9px 0',
                                           borderTop: '1px solid var(--grid)', alignItems: 'flex-start' }}>
              <AlertTriangle size={15} style={{ color: 'var(--critical)', flex: 'none', marginTop: 2 }} />
              <div style={{ flex: 1, fontSize: 13 }}>
                {a.message}
                <div className="cell-sub">
                  {a.alert_date} · {a.account_code} · {revenueFundTypeLabel(a.fund_type)}
                </div>
              </div>
              <span className="neg" style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap',
                                             fontVariantNumeric: 'tabular-nums' }}>
                {a.variance_pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </motion.div>
      )}

      <div className="grid">
        <motion.div className="card span-7" custom={3} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Monthly pacing</div>
          <h2>Collections vs. seasonal baseline</h2>
          <div className="c-sub">
            Bars are monthly deposits; the dashed line is where cumulative
            collections should sit given each stream's seasonal curve
          </div>
          <div className="legend">
            <span className="key"><span className="swatch" style={{ background: 'var(--series-2)', opacity: 0.55 }} />Monthly collections</span>
            <span className="key"><span className="swatch" style={{ background: 'var(--series-1)' }} />Cumulative actual</span>
            <span className="key"><span className="swatch" style={{ background: 'var(--baseline)' }} />Seasonal baseline</span>
          </div>
          <PacingChart rows={pacing} />
        </motion.div>

        <motion.div className="card span-5" custom={4} variants={stagger} initial="hidden" animate="show">
          <div className="eyebrow">Contribution</div>
          <h2>{notStarted ? 'Budget by revenue stream' : 'Collections by revenue stream'}</h2>
          <div className="legend">
            {Object.entries(REVENUE_FUND_TYPES).map(([k, v]) => (
              <span className="key" key={k}>
                <span className="swatch" style={{ background: FUND_COLORS[k] }} />{v}
              </span>
            ))}
          </div>
          <TreemapChart items={treemapItems}
                        valueName={notStarted ? 'Budgeted' : 'Collected YTD'} />
        </motion.div>
      </div>

      <div className="card">
        <div className="eyebrow">Variance early warning</div>
        <h2>Pacing by stream</h2>
        <div className="c-sub">
          Actual year-to-date vs. the seasonal budget baseline — streams more
          than 10% behind are flagged and alerted
        </div>
        <DataTable
          columns={[
            { key: 'account_code', label: 'Account' },
            {
              key: 'stream_name', label: 'Revenue stream',
              render: (s) => (
                <>
                  {s.stream_name}
                  <div className="cell-sub">{s.collector || '—'}</div>
                </>
              ),
            },
            { key: 'fund_type', label: 'Fund', render: (s) => revenueFundTypeLabel(s.fund_type) },
            { key: 'budgeted_amount', label: 'FY budget', numeric: true, render: (s) => fmtFull(s.budgeted_amount) },
            { key: 'expected_to_date', label: 'Baseline to date', numeric: true, render: (s) => fmtFull(s.expected_to_date) },
            { key: 'actual_amount', label: 'Actual YTD', numeric: true, render: (s) => fmtFull(s.actual_amount) },
            {
              key: 'variance_to_baseline', label: 'Variance', numeric: true,
              render: (s) => (
                <span className={s.variance_to_baseline < 0 ? 'neg' : ''}>
                  {fmtFull(s.variance_to_baseline)}
                </span>
              ),
            },
            {
              key: 'variance_to_baseline_pct', label: 'Var %', numeric: true,
              render: (s) => (
                <span className={s.variance_to_baseline_pct <= -10 ? 'neg' : ''}
                      style={{ fontWeight: s.variance_to_baseline_pct <= -10 ? 650 : undefined }}>
                  {s.expected_share < 0.05 ? '—' : s.variance_to_baseline_pct.toFixed(1) + '%'}
                </span>
              ),
            },
            {
              key: 'status', label: 'Status',
              sortValue: (s) => s.variance_to_baseline_pct,
              render: (s) => {
                const st = paceStatus(s)
                return <span style={{ color: st.tone, fontWeight: 600, fontSize: 12.5 }}>{st.label}</span>
              },
            },
          ]}
          rows={streamsSorted}
          rowKey={(s) => s.stream_id}
          initialSort={{ key: 'variance_to_baseline_pct', dir: 1 }}
          footer={[
            { content: `Total — ${status.length} streams`, colSpan: 3 },
            { content: fmtFull(budget), numeric: true },
            { content: fmtFull(expected), numeric: true },
            { content: fmtFull(collected), numeric: true },
            { content: fmtFull(collected - expected), numeric: true },
            { content: '' },
            { content: '' },
          ]}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Receipts ledger</div>
            <h2>Deposits & distributions</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              {fyLabel} · every number above derives from this ledger
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <select className="select" value={fundType} onChange={(e) => setFundType(e.target.value)}
                  aria-label="Filter by fund type">
            <option value="ALL">All funds</option>
            {Object.entries(REVENUE_FUND_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input className="input" placeholder="Search receipts…" value={q}
                 onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <button className="btn small" onClick={() =>
            downloadCsv(
              'revenue-receipts.csv',
              ['Date', 'Fiscal year', 'Account', 'Stream', 'Fund', 'Description',
               'Doc ref', 'Amount', 'Entered by'],
              ledger.map((t) => [
                t.receipt_date, t.fy_label, t.account_code, t.stream_name,
                revenueFundTypeLabel(t.fund_type), t.description || '',
                t.doc_reference || '', t.amount, t.entered_by || '',
              ]),
            )}>
            <Download /> Export CSV
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'receipt_date', label: 'Date' },
            { key: 'account_code', label: 'Account' },
            { key: 'stream_name', label: 'Stream' },
            { key: 'fund_type', label: 'Fund', render: (t) => revenueFundTypeLabel(t.fund_type) },
            { key: 'description', label: 'Description', render: (t) => t.description || '—' },
            { key: 'doc_reference', label: 'Doc ref', render: (t) => t.doc_reference || '—' },
            {
              key: 'amount', label: 'Amount', numeric: true,
              render: (t) => <span className={t.amount < 0 ? 'neg' : ''}>{fmtFull(t.amount)}</span>,
            },
            { key: 'entered_by', label: 'Entered by', render: (t) => t.entered_by || '—' },
          ]}
          rows={ledger}
          rowKey={(t) => t.receipt_id}
          initialSort={{ key: 'receipt_date', dir: -1 }}
          footer={[
            { content: `Total — ${ledger.length} receipt${ledger.length === 1 ? '' : 's'}`, colSpan: 6 },
            { content: fmtFull(ledger.reduce((s, t) => s + t.amount, 0)), numeric: true },
            { content: '' },
          ]}
        />
      </div>

      <ReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)}
                    streams={allStreams} />
      <StreamModal open={streamOpen} onClose={() => setStreamOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
