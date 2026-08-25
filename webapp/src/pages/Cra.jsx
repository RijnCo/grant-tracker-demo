import { useMemo, useState } from 'react'
import { Download, MapPin, Plus, ReceiptText } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { downloadCsv, fmtCompact, fmtFull, pctOf } from '../lib/format'
import { CRA_TXN_TYPES, craTxnTypeLabel } from '../lib/labels'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import UsageBar from '../components/UsageBar'

const STATUS_LABEL = { planned: 'Planned', underway: 'Underway', complete: 'Complete' }

function ProjectModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/cra-project', {
        method: 'POST',
        body: JSON.stringify({
          district_id: f.get('district_id'),
          project_name: f.get('project_name'),
          status: f.get('status'),
          budget_amount: f.get('budget_amount'),
          start_date: f.get('start_date'),
          target_completion: f.get('target_completion'),
        }),
      })
      toast(`Added project "${r.project_name}" with a ${fmtFull(r.budget)} budget.`)
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
        <h3>New CRA project</h3>
        <div className="m-sub">Approved by the CRA board; spending is capped at the budget.</div>
        <label htmlFor="cp-district">CRA district</label>
        <select id="cp-district" name="district_id" required>
          {(data.cra_districts || []).map((d) => (
            <option key={d.district_id} value={d.district_id}>{d.district_name}</option>
          ))}
        </select>
        <label htmlFor="cp-name">Project name</label>
        <input id="cp-name" name="project_name" required placeholder="Waterfront Boardwalk Repairs" />
        <div className="row2">
          <div>
            <label htmlFor="cp-budget">Approved budget ($)</label>
            <input id="cp-budget" name="budget_amount" type="number" step="0.01" min="1" required />
          </div>
          <div>
            <label htmlFor="cp-status">Status</label>
            <select id="cp-status" name="status" defaultValue="planned">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="cp-start">Start date</label>
            <input id="cp-start" name="start_date" type="date" />
          </div>
          <div>
            <label htmlFor="cp-end">Target completion</label>
            <input id="cp-end" name="target_completion" type="date" />
          </div>
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Add project</button>
        </div>
      </form>
    </Modal>
  )
}

function CraTxnModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const [districtId, setDistrictId] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/cra-transaction', {
        method: 'POST',
        body: JSON.stringify({
          district_id: f.get('district_id'),
          project_id: f.get('project_id') || null,
          txn_type: f.get('txn_type'),
          amount: f.get('amount'),
          transaction_date: f.get('transaction_date'),
          description: f.get('description'),
          doc_reference: f.get('doc_reference'),
        }),
      })
      toast(`Recorded — ${r.district_name} trust fund balance ${fmtFull(r.trust_balance)}.`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    }
  }
  const districts = data.cra_districts || []
  const activeDistrict = Number(districtId || districts[0]?.district_id)
  const projects = (data.cra_projects || []).filter((p) => p.district_id === activeDistrict)
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>Record CRA transaction</h3>
        <div className="m-sub">
          TIF increment deposits and other revenue add to the trust fund; project and
          admin expenses draw it down. Amounts are positive.
        </div>
        <label htmlFor="ct-district">CRA district</label>
        <select id="ct-district" name="district_id" required
                onChange={(e) => setDistrictId(e.target.value)}>
          {districts.map((d) => (
            <option key={d.district_id} value={d.district_id}>{d.district_name}</option>
          ))}
        </select>
        <div className="row2">
          <div>
            <label htmlFor="ct-type">Type</label>
            <select id="ct-type" name="txn_type" required>
              {Object.entries(CRA_TXN_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ct-amount">Amount ($)</label>
            <input id="ct-amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
        </div>
        <label htmlFor="ct-project">Project (for project expenses)</label>
        <select id="ct-project" name="project_id" defaultValue="">
          <option value="">— none / district-level —</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
          ))}
        </select>
        <div className="row2">
          <div>
            <label htmlFor="ct-date">Date</label>
            <input id="ct-date" name="transaction_date" type="date" required />
          </div>
          <div>
            <label htmlFor="ct-ref">Doc reference (optional)</label>
            <input id="ct-ref" name="doc_reference" placeholder="CRA-00123" />
          </div>
        </div>
        <label htmlFor="ct-desc">Description</label>
        <input id="ct-desc" name="description" placeholder="Contractor pay application" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Record</button>
        </div>
      </form>
    </Modal>
  )
}

/** Community Redevelopment Agency tracker (Ch. 163 Part III, F.S.). */
export default function Cra() {
  const { data, fy, canWrite } = useApp()
  const [q, setQ] = useState('')
  const [districtId, setDistrictId] = useState('ALL')
  const [projOpen, setProjOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)

  const districts = data.cra_districts || []
  const projects = data.cra_projects || []

  const txns = useMemo(() => {
    let r = data.cra_transactions || []
    if (fy !== 'ALL') r = r.filter((t) => t.fy_label === fy)
    if (districtId !== 'ALL') r = r.filter((t) => t.district_id === Number(districtId))
    const needle = q.trim().toLowerCase()
    if (needle) {
      r = r.filter((t) =>
        (t.description || '').toLowerCase().includes(needle) ||
        (t.project_name || '').toLowerCase().includes(needle) ||
        (t.doc_reference || '').toLowerCase().includes(needle))
    }
    return r
  }, [data, fy, districtId, q])

  const totBalance = districts.reduce((s, d) => s + d.trust_balance, 0)
  const signed = (t) =>
    (t.txn_type === 'project_expense' || t.txn_type === 'admin_expense' ? -t.amount : t.amount)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Ch. 163 Part III, Florida Statutes</div>
          <div className="hero-value" style={{ fontSize: 28 }}>Community Redevelopment</div>
          <div className="hero-sub">
            {districts.length} districts · {fmtCompact(totBalance)} held across the
            tax-increment trust funds · {projects.length} projects
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <>
            <button className="btn small" onClick={() => setProjOpen(true)}>
              <Plus /> New project
            </button>
            <button className="btn small primary" onClick={() => setTxnOpen(true)}>
              <ReceiptText /> Record transaction
            </button>
          </>
        )}
      </div>

      <div className="grid">
        {districts.map((d) => {
          const dProjects = projects.filter((p) => p.district_id === d.district_id)
          return (
            <div className="card span-6" key={d.district_id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="doc-ico" style={{ width: 34, height: 34 }}><MapPin /></div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ marginTop: 0 }}>{d.district_name}</h2>
                  <div className="c-sub" style={{ marginBottom: 0 }}>
                    Established {d.established_year} · sunsets {d.sunset_year}
                    {d.notes ? ' · ' + d.notes : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 21, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtFull(d.trust_balance)}
                  </div>
                  <div className="c-sub" style={{ marginBottom: 0 }}>
                    trust fund · {fmtCompact(d.total_revenue)} in / {fmtCompact(d.total_spent)} out
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                {dProjects.map((p) => {
                  const pct = pctOf(p.spent, p.budget_amount)
                  return (
                    <div key={p.project_id} style={{ padding: '8px 0', borderTop: '1px solid var(--grid)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 13, fontWeight: 550 }}>
                          {p.project_name}
                          <span className="cell-sub" style={{ display: 'inline', marginLeft: 8 }}>
                            {STATUS_LABEL[p.status]}
                          </span>
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCompact(p.spent)} of {fmtCompact(p.budget_amount)}
                        </span>
                      </div>
                      <div className="cellbar" style={{ width: '100%', marginTop: 6 }}>
                        <i style={{ transform: `scaleX(${pct / 100})`, background: 'var(--series-1)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="eyebrow">Approved projects</div>
        <h2>Project budgets</h2>
        <div className="c-sub">Spending is capped at the approved budget by a database control</div>
        <DataTable
          columns={[
            { key: 'project_name', label: 'Project' },
            { key: 'district_name', label: 'District' },
            { key: 'status', label: 'Status', render: (p) => STATUS_LABEL[p.status] },
            {
              key: 'window', label: 'Schedule', sortValue: (p) => p.start_date || '',
              render: (p) => p.start_date
                ? <>{p.start_date} <span style={{ color: 'var(--ink-3)' }}>→</span> {p.target_completion || '—'}</>
                : '—',
            },
            { key: 'budget_amount', label: 'Budget', numeric: true, render: (p) => fmtFull(p.budget_amount) },
            { key: 'spent', label: 'Spent', numeric: true, render: (p) => fmtFull(p.spent) },
            {
              key: 'remaining', label: 'Remaining', numeric: true,
              render: (p) => <span style={{ fontWeight: 650 }}>{fmtFull(p.remaining)}</span>,
            },
            {
              key: 'pct', label: '% used', numeric: true,
              sortValue: (p) => pctOf(p.spent, p.budget_amount),
              render: (p) => <UsageBar pct={pctOf(p.spent, p.budget_amount)} />,
            },
          ]}
          rows={projects}
          rowKey={(p) => p.project_id}
          initialSort={{ key: 'budget_amount', dir: -1 }}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Trust fund ledger</div>
            <h2>Transactions</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              {fy === 'ALL' ? 'All fiscal years' : fy} · TIF increments in, project spending out
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <select className="select" value={districtId} onChange={(e) => setDistrictId(e.target.value)}
                  aria-label="Filter by district">
            <option value="ALL">All districts</option>
            {districts.map((d) => (
              <option key={d.district_id} value={d.district_id}>{d.district_name}</option>
            ))}
          </select>
          <input className="input" placeholder="Search ledger…" value={q}
                 onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <button className="btn small" onClick={() =>
            downloadCsv(
              'cra-trust-fund-ledger.csv',
              ['Date', 'Fiscal year', 'District', 'Project', 'Type', 'Description',
               'Doc ref', 'Amount', 'Entered by'],
              txns.map((t) => [
                t.transaction_date, t.fy_label || '', t.district_name, t.project_name || '',
                craTxnTypeLabel(t.txn_type), t.description || '', t.doc_reference || '',
                signed(t), t.entered_by || '',
              ]),
            )}>
            <Download /> Export CSV
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'transaction_date', label: 'Date' },
            { key: 'district_name', label: 'District' },
            { key: 'project_name', label: 'Project', render: (t) => t.project_name || '—' },
            { key: 'txn_type', label: 'Type', render: (t) => craTxnTypeLabel(t.txn_type) },
            { key: 'description', label: 'Description', render: (t) => t.description || '—' },
            { key: 'doc_reference', label: 'Doc ref', render: (t) => t.doc_reference || '—' },
            {
              key: 'amount', label: 'Amount', numeric: true, sortValue: signed,
              render: (t) => <span className={signed(t) < 0 ? 'neg' : ''}>{fmtFull(signed(t))}</span>,
            },
            { key: 'entered_by', label: 'Entered by', render: (t) => t.entered_by || '—' },
          ]}
          rows={txns}
          rowKey={(t) => t.cra_txn_id}
          initialSort={{ key: 'transaction_date', dir: -1 }}
          footer={[
            { content: `Net — ${txns.length} transaction${txns.length === 1 ? '' : 's'}`, colSpan: 6 },
            { content: fmtFull(txns.reduce((s, t) => s + signed(t), 0)), numeric: true },
            { content: '' },
          ]}
        />
      </div>

      <ProjectModal open={projOpen} onClose={() => setProjOpen(false)} />
      <CraTxnModal open={txnOpen} onClose={() => setTxnOpen(false)} />
    </div>
  )
}
