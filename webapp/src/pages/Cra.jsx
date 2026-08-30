import { useMemo, useState } from 'react'
import { Coins, Download, MapPin, Megaphone, Plus, ReceiptText } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { downloadCsv, fmtCompact, fmtFull, pctOf } from '../lib/format'
import {
  CRA_CATEGORIES, CRA_ENGAGEMENT_TYPES, CRA_FUNDING_TYPES, CRA_TXN_TYPES,
  craCategoryLabel, craEngagementTypeLabel, craTxnTypeLabel,
} from '../lib/labels'
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
          project_code: f.get('project_code'),
          project_name: f.get('project_name'),
          category: f.get('category'),
          project_manager: f.get('project_manager'),
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
        <div className="row2">
          <div>
            <label htmlFor="cp-code">Project ID</label>
            <input id="cp-code" name="project_code" placeholder="CRA-DT-004" />
          </div>
          <div>
            <label htmlFor="cp-category">Category</label>
            <select id="cp-category" name="category" defaultValue="infrastructure">
              {Object.entries(CRA_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="cp-name">Project name</label>
        <input id="cp-name" name="project_name" required placeholder="Waterfront Boardwalk Repairs" />
        <label htmlFor="cp-manager">Project manager</label>
        <input id="cp-manager" name="project_manager" placeholder="Maria Garcia" />
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

function FundingModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/cra-project-funding', {
        method: 'POST',
        body: JSON.stringify({
          project_id: f.get('project_id'),
          source_name: f.get('source_name'),
          source_type: f.get('source_type'),
          amount: f.get('amount'),
        }),
      })
      toast(`Funding source added to "${r.project_name}".`)
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
        <h3>Add project funding source</h3>
        <div className="m-sub">
          Identified sources may not exceed the approved project budget
          (enforced by a database control).
        </div>
        <label htmlFor="cf-project">Project</label>
        <select id="cf-project" name="project_id" required>
          {(data.cra_projects || []).map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {(p.project_code ? p.project_code + ' — ' : '') + p.project_name}
            </option>
          ))}
        </select>
        <label htmlFor="cf-name">Source name</label>
        <input id="cf-name" name="source_name" required placeholder="Redevelopment trust fund (TIF)" />
        <div className="row2">
          <div>
            <label htmlFor="cf-type">Source type</label>
            <select id="cf-type" name="source_type" defaultValue="tax_increment">
              {Object.entries(CRA_FUNDING_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cf-amount">Amount ($)</label>
            <input id="cf-amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Add source</button>
        </div>
      </form>
    </Modal>
  )
}

function EngagementModal({ open, onClose }) {
  const { data, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/cra-engagement', {
        method: 'POST',
        body: JSON.stringify({
          project_id: f.get('project_id'),
          engagement_type: f.get('engagement_type'),
          engagement_date: f.get('engagement_date'),
          title: f.get('title'),
          participants: f.get('participants'),
          summary: f.get('summary'),
          action_taken: f.get('action_taken'),
        }),
      })
      toast(`Engagement logged for "${r.project_name}".`)
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
        <h3>Log community engagement</h3>
        <div className="m-sub">
          Record the survey, meeting, or event held for a project and the
          action the CRA took in response.
        </div>
        <label htmlFor="ce-project">Project</label>
        <select id="ce-project" name="project_id" required>
          {(data.cra_projects || []).map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {(p.project_code ? p.project_code + ' — ' : '') + p.project_name}
            </option>
          ))}
        </select>
        <div className="row2">
          <div>
            <label htmlFor="ce-type">Engagement type</label>
            <select id="ce-type" name="engagement_type" defaultValue="survey">
              {Object.entries(CRA_ENGAGEMENT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ce-date">Date</label>
            <input id="ce-date" name="engagement_date" type="date" />
          </div>
        </div>
        <label htmlFor="ce-title">Title</label>
        <input id="ce-title" name="title" required placeholder="Streetscape design survey" />
        <div className="row2">
          <div>
            <label htmlFor="ce-participants">Participants</label>
            <input id="ce-participants" name="participants" type="number" min="0" />
          </div>
          <div>
            <label htmlFor="ce-summary">Summary (optional)</label>
            <input id="ce-summary" name="summary" placeholder="What was asked / discussed" />
          </div>
        </div>
        <label htmlFor="ce-action">Action taken</label>
        <input id="ce-action" name="action_taken"
               placeholder="What changed in the project because of this input" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Log engagement</button>
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

function DistrictStat({ label, value, sub }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="c-sub" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div className="cell-sub">{sub}</div>}
    </div>
  )
}

/** Community Redevelopment Agency tracker (Ch. 163 Part III, F.S.). */
export default function Cra() {
  const { data, fy, canWrite } = useApp()
  const [q, setQ] = useState('')
  const [districtId, setDistrictId] = useState('ALL')
  const [projOpen, setProjOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)
  const [engOpen, setEngOpen] = useState(false)
  const [fundOpen, setFundOpen] = useState(false)

  const districts = data.cra_districts || []
  const projects = data.cra_projects || []
  const fundingSources = data.cra_funding_sources || []
  const engagements = data.cra_engagements || []

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
            {districts.length} districts · {fmtCompact(totBalance)} available across the
            tax-increment trust funds · {projects.length} projects ·{' '}
            {engagements.length} engagement events
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
          const dSources = fundingSources.filter((f) => f.district_id === d.district_id)
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
                    available budget · {fmtCompact(d.total_revenue)} in / {fmtCompact(d.total_spent)} out
                  </div>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginTop: 12, padding: '10px 12px',
                border: '1px solid var(--grid)', borderRadius: 10,
              }}>
                <DistrictStat label={`Baseline value (${d.base_year})`}
                              value={fmtCompact(d.base_taxable_value)} />
                <DistrictStat label="Current taxable value"
                              value={fmtCompact(d.current_taxable_value)}
                              sub={`+${fmtCompact(d.increment_value)} increment`} />
                <DistrictStat label="TIF revenue generated" value={fmtCompact(d.tif_revenue)} />
                <DistrictStat label="Available budget" value={fmtCompact(d.trust_balance)} />
              </div>

              {dSources.length > 0 && (
                <div className="c-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                  <Coins style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 5 }} />
                  Funded by {dSources.map((f, i) => (
                    <span key={f.funding_source_id}>
                      {i > 0 && ' · '}
                      {f.source_name}
                      {f.annual_amount ? ` (${fmtCompact(f.annual_amount)}/yr)` : ''}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                {dProjects.map((p) => {
                  const pct = pctOf(p.spent, p.budget_amount)
                  return (
                    <div key={p.project_id} style={{ padding: '8px 0', borderTop: '1px solid var(--grid)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 13, fontWeight: 550 }}>
                          {p.project_name}
                          <span className="cell-sub" style={{ display: 'inline', marginLeft: 8 }}>
                            {craCategoryLabel(p.category)} · {STATUS_LABEL[p.status]}
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Approved projects</div>
            <h2>Project budgets</h2>
            <div className="c-sub">Spending is capped at the approved budget by a database control</div>
          </div>
          <div style={{ flex: 1 }} />
          {canWrite && (
            <button className="btn small" onClick={() => setFundOpen(true)}>
              <Coins /> Add funding source
            </button>
          )}
        </div>
        <DataTable
          columns={[
            {
              key: 'project_name', label: 'Project',
              render: (p) => (
                <>
                  {p.project_name}
                  <div className="cell-sub">
                    {p.project_code || '—'} · PM {p.project_manager || '—'}
                  </div>
                </>
              ),
            },
            { key: 'district_name', label: 'District' },
            { key: 'category', label: 'Category', render: (p) => craCategoryLabel(p.category) },
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
            {
              key: 'funding_sources', label: 'Funding sources',
              render: (p) => (
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {p.funding_sources || '—'}
                </span>
              ),
            },
            {
              key: 'engagement_done', label: 'Engagement',
              sortValue: (p) => (p.engagement_done === 'Yes' ? p.engagement_count : -1),
              render: (p) => p.engagement_done === 'Yes'
                ? <span style={{ fontWeight: 600 }}>Yes ({p.engagement_count})</span>
                : <span style={{ color: 'var(--ink-3)' }}>No</span>,
            },
          ]}
          rows={projects}
          rowKey={(p) => p.project_id}
          initialSort={{ key: 'budget_amount', dir: -1 }}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Public participation</div>
            <h2>Community engagement</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              Surveys, meetings, and events held per project — and the action taken in response
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {canWrite && (
            <button className="btn small" onClick={() => setEngOpen(true)}>
              <Megaphone /> Log engagement
            </button>
          )}
          <button className="btn small" onClick={() =>
            downloadCsv(
              'cra-community-engagement.csv',
              ['Date', 'District', 'Project ID', 'Project', 'Type', 'Title',
               'Participants', 'Summary', 'Action taken'],
              engagements.map((g) => [
                g.engagement_date || '', g.district_name, g.project_code || '',
                g.project_name, craEngagementTypeLabel(g.engagement_type), g.title,
                g.participants ?? '', g.summary || '', g.action_taken || '',
              ]),
            )}>
            <Download /> Export CSV
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'engagement_date', label: 'Date', render: (g) => g.engagement_date || '—' },
            { key: 'district_name', label: 'District' },
            {
              key: 'project_name', label: 'Project',
              render: (g) => (
                <>
                  {g.project_name}
                  <div className="cell-sub">{g.project_code || '—'}</div>
                </>
              ),
            },
            { key: 'engagement_type', label: 'Type', render: (g) => craEngagementTypeLabel(g.engagement_type) },
            { key: 'title', label: 'Event' },
            {
              key: 'participants', label: 'Participants', numeric: true,
              render: (g) => (g.participants == null ? '—' : g.participants),
            },
            {
              key: 'action_taken', label: 'Action taken',
              render: (g) => (
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {g.action_taken || '—'}
                </span>
              ),
            },
          ]}
          rows={engagements}
          rowKey={(g) => g.engagement_id}
          initialSort={{ key: 'engagement_date', dir: -1 }}
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
      <FundingModal open={fundOpen} onClose={() => setFundOpen(false)} />
      <EngagementModal open={engOpen} onClose={() => setEngOpen(false)} />
      <CraTxnModal open={txnOpen} onClose={() => setTxnOpen(false)} />
    </div>
  )
}
