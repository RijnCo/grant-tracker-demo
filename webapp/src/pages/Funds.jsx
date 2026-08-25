import { useMemo, useState } from 'react'
import { Download, Plus, ReceiptText, Wallet } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { downloadCsv, fmtCompact, fmtFull, pctOf } from '../lib/format'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import UsageBar from '../components/UsageBar'

const TXN_TYPES = {
  expense: 'Expense', revenue: 'Revenue',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out',
}

function FundModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/fund', {
        method: 'POST',
        body: JSON.stringify({
          fund_code: f.get('fund_code'),
          fund_name: f.get('fund_name'),
          fiscal_year_id: f.get('fiscal_year_id'),
          budget_amount: f.get('budget_amount'),
          notes: f.get('notes'),
        }),
      })
      toast(`Added fund ${r.fund_code} — ${r.fund_name}`)
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
        <h3>New operating fund budget</h3>
        <div className="m-sub">One budget row per fund per fiscal year.</div>
        <div className="row2">
          <div>
            <label htmlFor="fu-code">Fund code</label>
            <input id="fu-code" name="fund_code" required placeholder="001" />
          </div>
          <div>
            <label htmlFor="fu-fy">Fiscal year</label>
            <select id="fu-fy" name="fiscal_year_id" required defaultValue={
              data.fiscal_years[data.fiscal_years.length - 1]?.fiscal_year_id
            }>
              {data.fiscal_years.map((f) => (
                <option key={f.fiscal_year_id} value={f.fiscal_year_id}>{f.fy_label}</option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="fu-name">Fund name</label>
        <input id="fu-name" name="fund_name" required placeholder="General Fund" />
        <label htmlFor="fu-budget">Adopted budget ($)</label>
        <input id="fu-budget" name="budget_amount" type="number" step="0.01" min="1" required />
        <label htmlFor="fu-notes">Notes (optional)</label>
        <input id="fu-notes" name="notes" placeholder="Primary operating fund" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Add fund</button>
        </div>
      </form>
    </Modal>
  )
}

function FundTxnModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/fund-transaction', {
        method: 'POST',
        body: JSON.stringify({
          fund_id: f.get('fund_id'),
          txn_type: f.get('txn_type'),
          amount: f.get('amount'),
          transaction_date: f.get('transaction_date'),
          description: f.get('description'),
          doc_reference: f.get('doc_reference'),
          department_id: f.get('department_id') || null,
        }),
      })
      toast(`Recorded — ${r.fund_code} ${r.fund_name} has ${fmtFull(r.available)} available.`)
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
        <h3>Record fund transaction</h3>
        <div className="m-sub">Amounts are positive — the type carries the direction.</div>
        <label htmlFor="ft-fund">Fund (fiscal year)</label>
        <select id="ft-fund" name="fund_id" required>
          {(data.funds || []).map((f) => (
            <option key={f.fund_id} value={f.fund_id}>
              {f.fund_code} — {f.fund_name} ({f.fy_label})
            </option>
          ))}
        </select>
        <div className="row2">
          <div>
            <label htmlFor="ft-type">Type</label>
            <select id="ft-type" name="txn_type" required>
              {Object.entries(TXN_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ft-amount">Amount ($)</label>
            <input id="ft-amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="ft-date">Date</label>
            <input id="ft-date" name="transaction_date" type="date" required />
          </div>
          <div>
            <label htmlFor="ft-dept">Department (optional)</label>
            <select id="ft-dept" name="department_id" defaultValue="">
              <option value="">—</option>
              {(data.department_list || []).map((d) => (
                <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="ft-desc">Description</label>
        <input id="ft-desc" name="description" placeholder="Payroll and benefits" />
        <label htmlFor="ft-ref">Doc reference (optional)</label>
        <input id="ft-ref" name="doc_reference" placeholder="AP-00123" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Record</button>
        </div>
      </form>
    </Modal>
  )
}

/** Basic tracker for general operating funds — budgets in, money out. */
export default function Funds() {
  const { data, fy, canWrite } = useApp()
  const [q, setQ] = useState('')
  const [fundId, setFundId] = useState('ALL')
  const [fundOpen, setFundOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)

  const funds = useMemo(
    () => (data.funds || []).filter((f) => fy === 'ALL' || f.fy_label === fy),
    [data, fy])

  const txns = useMemo(() => {
    let r = data.fund_transactions || []
    if (fy !== 'ALL') r = r.filter((t) => t.fy_label === fy)
    if (fundId !== 'ALL') r = r.filter((t) => t.fund_id === Number(fundId))
    const needle = q.trim().toLowerCase()
    if (needle) {
      r = r.filter((t) =>
        (t.description || '').toLowerCase().includes(needle) ||
        (t.doc_reference || '').toLowerCase().includes(needle) ||
        t.fund_name.toLowerCase().includes(needle) ||
        (t.department_name || '').toLowerCase().includes(needle))
    }
    return r
  }, [data, fy, fundId, q])

  const totBudget = funds.reduce((s, f) => s + f.budget_amount, 0)
  const totAvail = funds.reduce((s, f) => s + f.available, 0)
  const totOut = funds.reduce((s, f) => s + f.total_out, 0)

  const signed = (t) => (t.txn_type === 'expense' || t.txn_type === 'transfer_out' ? -t.amount : t.amount)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">City operations</div>
          <div className="hero-value" style={{ fontSize: 28 }}>General operating funds</div>
          <div className="hero-sub">
            {fmtCompact(totAvail)} available of {fmtCompact(totBudget)} budgeted
            {fy === 'ALL' ? ' across all fund years' : ' in ' + fy} — separate from grant awards
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <>
            <button className="btn small" onClick={() => setFundOpen(true)}>
              <Plus /> New fund
            </button>
            <button className="btn small primary" onClick={() => setTxnOpen(true)}>
              <ReceiptText /> Record transaction
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div className="doc-ico" style={{ width: 34, height: 34 }}><Wallet /></div>
          <div>
            <h2 style={{ marginTop: 0 }}>Fund balances</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              Adopted budget plus revenues in, minus expenses and transfers out
            </div>
          </div>
        </div>
        <DataTable
          columns={[
            {
              key: 'fund_code', label: 'Fund',
              render: (f) => (
                <div>
                  <div style={{ fontWeight: 550 }}>{f.fund_code} — {f.fund_name}</div>
                  {f.notes && <div className="cell-sub">{f.notes}</div>}
                </div>
              ),
            },
            { key: 'fy_label', label: 'Fiscal year' },
            { key: 'budget_amount', label: 'Budget', numeric: true, render: (f) => fmtFull(f.budget_amount) },
            { key: 'total_in', label: 'Revenues in', numeric: true, render: (f) => fmtFull(f.total_in) },
            { key: 'total_out', label: 'Spent / out', numeric: true, render: (f) => fmtFull(f.total_out) },
            {
              key: 'available', label: 'Available', numeric: true,
              render: (f) => <span style={{ fontWeight: 650 }}>{fmtFull(f.available)}</span>,
            },
            {
              key: 'pct', label: '% used', numeric: true,
              sortValue: (f) => pctOf(f.total_out, f.budget_amount + f.total_in),
              render: (f) => <UsageBar pct={pctOf(f.total_out, f.budget_amount + f.total_in)} />,
            },
          ]}
          rows={funds}
          rowKey={(f) => f.fund_id}
          initialSort={{ key: 'budget_amount', dir: -1 }}
          footer={[
            { content: `Total — ${funds.length} fund year${funds.length === 1 ? '' : 's'}`, colSpan: 2 },
            { content: fmtFull(totBudget), numeric: true },
            { content: fmtFull(funds.reduce((s, f) => s + f.total_in, 0)), numeric: true },
            { content: fmtFull(totOut), numeric: true },
            { content: fmtFull(totAvail), numeric: true },
            { content: '' },
          ]}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Fund ledger</div>
            <h2>Transactions</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              {fy === 'ALL' ? 'All fiscal years' : fy}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <select className="select" value={fundId} onChange={(e) => setFundId(e.target.value)}
                  aria-label="Filter by fund">
            <option value="ALL">All funds</option>
            {(data.funds || []).map((f) => (
              <option key={f.fund_id} value={f.fund_id}>
                {f.fund_code} — {f.fund_name} ({f.fy_label})
              </option>
            ))}
          </select>
          <input className="input" placeholder="Search ledger…" value={q}
                 onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <button className="btn small" onClick={() =>
            downloadCsv(
              'operating-fund-ledger.csv',
              ['Date', 'Fiscal year', 'Fund code', 'Fund', 'Type', 'Department',
               'Description', 'Doc ref', 'Amount', 'Entered by'],
              txns.map((t) => [
                t.transaction_date, t.fy_label, t.fund_code, t.fund_name,
                TXN_TYPES[t.txn_type] || t.txn_type, t.department_name || '',
                t.description || '', t.doc_reference || '', signed(t), t.entered_by || '',
              ]),
            )}>
            <Download /> Export CSV
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'transaction_date', label: 'Date' },
            {
              key: 'fund_code', label: 'Fund',
              render: (t) => (
                <div>
                  <div style={{ fontWeight: 550 }}>{t.fund_code} — {t.fund_name}</div>
                  <div className="cell-sub">{t.fy_label}</div>
                </div>
              ),
            },
            { key: 'txn_type', label: 'Type', render: (t) => TXN_TYPES[t.txn_type] || t.txn_type },
            { key: 'department_name', label: 'Department', render: (t) => t.department_name || '—' },
            { key: 'description', label: 'Description', render: (t) => t.description || '—' },
            { key: 'doc_reference', label: 'Doc ref', render: (t) => t.doc_reference || '—' },
            {
              key: 'amount', label: 'Amount', numeric: true, sortValue: signed,
              render: (t) => <span className={signed(t) < 0 ? 'neg' : ''}>{fmtFull(signed(t))}</span>,
            },
            { key: 'entered_by', label: 'Entered by', render: (t) => t.entered_by || '—' },
          ]}
          rows={txns}
          rowKey={(t) => t.fund_txn_id}
          initialSort={{ key: 'transaction_date', dir: -1 }}
          footer={[
            { content: `Net — ${txns.length} transaction${txns.length === 1 ? '' : 's'}`, colSpan: 6 },
            { content: fmtFull(txns.reduce((s, t) => s + signed(t), 0)), numeric: true },
            { content: '' },
          ]}
        />
      </div>

      <FundModal open={fundOpen} onClose={() => setFundOpen(false)} />
      <FundTxnModal open={txnOpen} onClose={() => setTxnOpen(false)} />
    </div>
  )
}
