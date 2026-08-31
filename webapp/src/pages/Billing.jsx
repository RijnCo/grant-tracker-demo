import { useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, Download, Plus, Scale } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { downloadCsv, fmtFull } from '../lib/format'
import {
  APPROVAL_ROLES, BILLING_ADJUSTMENT_TYPES, BILLING_CATEGORIES,
  BILLING_PRIORITIES, BILLING_SERVICES, BILLING_SOURCES, BILLING_STATUSES,
  approvalRoleLabel, billingAdjTypeLabel, billingCategoryLabel,
  billingServiceLabel, billingSourceLabel, billingStatusLabel,
} from '../lib/labels'
import DataTable from '../components/DataTable'
import DeleteButton from '../components/DeleteButton'
import Modal from '../components/Modal'

const STATUS_TONE = {
  new: 'var(--ink-3)',
  under_review: 'var(--accent)',
  pending_approval: 'var(--warning)',
  resolved: 'var(--good)',
}
const PRIORITY_TONE = { low: 'var(--ink-3)', medium: 'var(--warning)', high: 'var(--critical)' }

function StatusChip({ status }) {
  return (
    <span style={{ color: STATUS_TONE[status], fontWeight: 600, fontSize: 12.5 }}>
      {billingStatusLabel(status)}
    </span>
  )
}

function NewTicketModal({ open, onClose }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const body = {}
      for (const k of ['account_number', 'customer_name', 'contact_info',
        'service_address', 'utility_service', 'category', 'source',
        'original_bill_amount', 'disputed_bill_amount', 'original_usage',
        'corrected_usage', 'usage_unit', 'ticket_owner', 'priority',
        'date_received', 'resolution_deadline', 'notes']) body[k] = f.get(k)
      const r = await api('/api/billing-ticket', { method: 'POST', body: JSON.stringify(body) })
      toast(`Logged ticket ${r.ticket_code}.`)
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
        <h3>Log billing discrepancy</h3>
        <div className="m-sub">
          Intake per the SOP — pick a category (use Other only with an
          exhaustive note) and set the resolution deadline.
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-acct">Account number</label>
            <input id="bt-acct" name="account_number" required placeholder="04-118234-01" />
          </div>
          <div>
            <label htmlFor="bt-service">Utility service</label>
            <select id="bt-service" name="utility_service" defaultValue="water">
              {Object.entries(BILLING_SERVICES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="bt-name">Customer name</label>
        <input id="bt-name" name="customer_name" required />
        <div className="row2">
          <div>
            <label htmlFor="bt-contact">Contact info</label>
            <input id="bt-contact" name="contact_info" placeholder="(850) 555-0142" />
          </div>
          <div>
            <label htmlFor="bt-addr">Service address</label>
            <input id="bt-addr" name="service_address" />
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-cat">Discrepancy category</label>
            <select id="bt-cat" name="category" required>
              {Object.entries(BILLING_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bt-src">Source</label>
            <select id="bt-src" name="source" defaultValue="customer">
              {Object.entries(BILLING_SOURCES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-orig">Original bill ($)</label>
            <input id="bt-orig" name="original_bill_amount" type="number" step="0.01" />
          </div>
          <div>
            <label htmlFor="bt-disp">Disputed amount ($)</label>
            <input id="bt-disp" name="disputed_bill_amount" type="number" step="0.01" />
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-ouse">Original usage</label>
            <input id="bt-ouse" name="original_usage" type="number" step="any" />
          </div>
          <div>
            <label htmlFor="bt-unit">Usage unit</label>
            <select id="bt-unit" name="usage_unit" defaultValue="gal">
              <option value="">—</option>
              <option value="gal">Gallons</option>
              <option value="kwh">kWh</option>
              <option value="therms">Therms</option>
              <option value="ccf">CCF</option>
            </select>
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-cuse">Corrected usage</label>
            <input id="bt-cuse" name="corrected_usage" type="number" step="any" />
          </div>
          <div>
            <label htmlFor="bt-owner">Ticket owner</label>
            <input id="bt-owner" name="ticket_owner" placeholder="staff username" />
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-recv">Date received</label>
            <input id="bt-recv" name="date_received" type="date" required />
          </div>
          <div>
            <label htmlFor="bt-dead">Resolution deadline</label>
            <input id="bt-dead" name="resolution_deadline" type="date" />
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bt-pri">Priority</label>
            <select id="bt-pri" name="priority" defaultValue="medium">
              {Object.entries(BILLING_PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div />
        </div>
        <label htmlFor="bt-notes">Notes</label>
        <input id="bt-notes" name="notes" placeholder="Required when the category is Other" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Log ticket</button>
        </div>
      </form>
    </Modal>
  )
}

function TicketDetailModal({ ticket, onClose }) {
  const { data, refresh, guard, canWrite } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const [adjErr, setAdjErr] = useState('')
  if (!ticket) return null
  const adjustments = (data.billing_adjustments || []).filter((a) => a.ticket_id === ticket.ticket_id)
  const close = () => { setErr(''); setAdjErr(''); onClose() }

  const saveTicket = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      await api('/api/billing-ticket-update', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: ticket.ticket_id,
          status: f.get('status'),
          ticket_owner: f.get('ticket_owner'),
          priority: f.get('priority'),
        }),
      })
      toast(`Updated ${ticket.ticket_code}.`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    }
  }
  const addAdjustment = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setAdjErr('')
    try {
      await api('/api/billing-adjustment', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: ticket.ticket_id,
          adjustment_type: f.get('adjustment_type'),
          amount: f.get('amount'),
          adjustment_code: f.get('adjustment_code'),
          je_reference: f.get('je_reference'),
          approved_by: f.get('approved_by'),
          approval_role: f.get('approval_role'),
          approval_date: f.get('approval_date'),
        }),
      })
      toast(`Adjustment recorded on ${ticket.ticket_code}.`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setAdjErr(ex.message)
    }
  }

  const info = [
    ['Account', ticket.account_number], ['Service', billingServiceLabel(ticket.utility_service)],
    ['Category', billingCategoryLabel(ticket.category)], ['Source', billingSourceLabel(ticket.source)],
    ['Original bill', ticket.original_bill_amount == null ? '—' : fmtFull(ticket.original_bill_amount)],
    ['Disputed', ticket.disputed_bill_amount == null ? '—' : fmtFull(ticket.disputed_bill_amount)],
    ['Usage', ticket.original_usage == null ? '—'
      : `${ticket.original_usage.toLocaleString()} → ${ticket.corrected_usage == null ? '?' : ticket.corrected_usage.toLocaleString()} ${ticket.usage_unit || ''}`],
    ['Received', `${ticket.date_received} · due ${ticket.resolution_deadline || '—'}`],
  ]
  return (
    <Modal open={!!ticket} onClose={close}>
      <div>
        <h3>{ticket.ticket_code} — {ticket.customer_name}</h3>
        <div className="m-sub">
          {ticket.service_address || 'No service address'} · {ticket.contact_info || 'no contact on file'}
          {ticket.notes ? <><br />{ticket.notes}</> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', margin: '10px 0' }}>
          {info.map(([k, v]) => (
            <div key={k} style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink-3)' }}>{k}</span>{' '}
              <span style={{ fontWeight: 550 }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{ marginTop: 12 }}>Adjustments on file</div>
        {adjustments.length === 0 && (
          <div className="c-sub">None yet — a verified adjustment code is required before this ticket can be resolved.</div>
        )}
        {adjustments.map((a) => (
          <div key={a.adjustment_id} style={{ padding: '7px 0', borderTop: '1px solid var(--grid)', fontSize: 12.5 }}>
            <b>{billingAdjTypeLabel(a.adjustment_type)}</b>
            {a.adjustment_type !== 'no_change' && <> · {fmtFull(a.amount)}</>}
            {' · '}code {a.adjustment_code || '—'} · JE {a.je_reference || '—'}
            <div className="cell-sub">
              {approvalRoleLabel(a.approval_role)} {a.approved_by ? `(${a.approved_by})` : ''} · {a.approval_date || '—'}
            </div>
          </div>
        ))}

        {canWrite && (
          <>
            <form onSubmit={saveTicket} style={{ borderTop: '1px solid var(--grid)', marginTop: 12, paddingTop: 8 }}>
              <div className="eyebrow">Update ticket</div>
              <div className="row2">
                <div>
                  <label htmlFor="tu-status">Status</label>
                  <select id="tu-status" name="status" defaultValue={ticket.status}>
                    {Object.entries(BILLING_STATUSES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="tu-pri">Priority</label>
                  <select id="tu-pri" name="priority" defaultValue={ticket.priority}>
                    {Object.entries(BILLING_PRIORITIES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label htmlFor="tu-owner">Ticket owner</label>
              <input id="tu-owner" name="ticket_owner" defaultValue={ticket.ticket_owner || ''} />
              <div className="err">{err}</div>
              <div className="actions">
                <button type="submit" className="btn small">Save ticket</button>
              </div>
            </form>

            <form onSubmit={addAdjustment} style={{ borderTop: '1px solid var(--grid)', marginTop: 8, paddingTop: 8 }}>
              <div className="eyebrow">Record adjustment</div>
              <div className="m-sub">
                $0–$50 frontline · $50.01–$500 supervisor · over $500 director/CFO.
                A JE reference is required over $50.
              </div>
              <div className="row2">
                <div>
                  <label htmlFor="ta-type">Type</label>
                  <select id="ta-type" name="adjustment_type" defaultValue="credit">
                    {Object.entries(BILLING_ADJUSTMENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ta-amount">Amount ($)</label>
                  <input id="ta-amount" name="amount" type="number" step="0.01" min="0" defaultValue="0" />
                </div>
              </div>
              <div className="row2">
                <div>
                  <label htmlFor="ta-code">Adjustment code</label>
                  <input id="ta-code" name="adjustment_code" placeholder="ADJ-77xxx" />
                </div>
                <div>
                  <label htmlFor="ta-je">JE reference</label>
                  <input id="ta-je" name="je_reference" placeholder="JE-2026-…" />
                </div>
              </div>
              <div className="row2">
                <div>
                  <label htmlFor="ta-role">Approval level</label>
                  <select id="ta-role" name="approval_role">
                    {Object.entries(APPROVAL_ROLES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ta-by">Approved by</label>
                  <input id="ta-by" name="approved_by" />
                </div>
              </div>
              <label htmlFor="ta-date">Approval date</label>
              <input id="ta-date" name="approval_date" type="date" />
              <div className="err">{adjErr}</div>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={close}>Close</button>
                <button type="submit" className="btn small primary">Record adjustment</button>
              </div>
            </form>
          </>
        )}
        {!canWrite && (
          <div className="actions">
            <button type="button" className="btn ghost" onClick={close}>Close</button>
          </div>
        )}
      </div>
    </Modal>
  )
}

const GUIDE_MATRIX = [
  ['$0.00 – $50.00', 'Frontline billing representative', '24 hours'],
  ['$50.01 – $500.00', 'Billing operations supervisor', '48 hours'],
  ['Over $500.00', 'Department director / CFO', '5 business days'],
]

function GuideTab() {
  return (
    <div className="grid">
      <div className="card span-6">
        <div className="eyebrow">1 · System logging protocol</div>
        <h2>Intake</h2>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li>On customer contact, query the customer account number first.</li>
          <li>Open a new entry and complete every field in the Intake section —
              account, customer, service, and the financial &amp; usage figures.</li>
          <li>Never leave the discrepancy category blank. Use <b>Other</b> only when no
              predefined category matches, and leave an exhaustive note.</li>
          <li>Set the ticket owner, priority, and a resolution deadline; overdue
              tickets are flagged automatically.</li>
        </ol>
      </div>
      <div className="card span-6">
        <div className="eyebrow">2 · Adjustment approval matrix</div>
        <h2>Who can approve what</h2>
        <div className="c-sub">Enforced by a database control — an out-of-tier approval is rejected</div>
        <table>
          <thead>
            <tr><th>Adjustment amount</th><th>Required approval</th><th>SLA target</th></tr>
          </thead>
          <tbody>
            {GUIDE_MATRIX.map((r) => (
              <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card span-6">
        <div className="eyebrow">3 · Data auditing &amp; closing rules</div>
        <h2>Resolution</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li>A ticket moves to <b>Resolved</b> only after a verified adjustment code
              has been pushed to the utility billing system (enforced).</li>
          <li>A journal entry (JE) reference number is required for any financial
              adjustment exceeding $50.01 (enforced).</li>
          <li>The supervisor runs the weekly reconciliation audit on the
              Reconciliation tab, comparing logged adjustments against credits
              issued in the billing ledger.</li>
          <li>Every status change is written to an append-only event log.</li>
        </ul>
      </div>
      <div className="card span-6">
        <div className="eyebrow">4 · Pilot &amp; training</div>
        <h2>Rollout</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li><b>30-day pilot:</b> week 1 selection &amp; setup → weeks 2–3 active
              tracking (shadow the legacy workflow for the first 14 days) →
              week 4 review &amp; audit. Pilot with 3–5 experienced billing reps.</li>
          <li><b>Feedback loop:</b> 30-minute weekly review with pilot users to catch
              data-entry bottlenecks or missing fields.</li>
          <li><b>Role-based training:</b> frontline staff (data entry, categories,
              customer communication) vs. billing managers (approval thresholds,
              overrides, reporting).</li>
          <li><b>Sandbox:</b> the five resolved historical disputes (UB-2026-001
              through 005) are the training set — log, review, and adjust them
              end to end.</li>
          <li><b>Success metrics:</b> first-time log accuracy &gt;95%; average
              logging time under 3 minutes per ticket.</li>
        </ul>
      </div>
    </div>
  )
}

/** Utility billing discrepancy & adjustment tracker (the Hollin tracker). */
export default function Billing() {
  const { data, canWrite } = useApp()
  const [tab, setTab] = useState('tickets')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('OPEN')
  const [category, setCategory] = useState('ALL')
  const [newOpen, setNewOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  const tickets = data.billing_tickets || []
  const recon = data.billing_recon || []

  const open = tickets.filter((t) => t.status !== 'resolved')
  const overdue = tickets.filter((t) => t.is_overdue)
  const pending = tickets.filter((t) => t.status === 'pending_approval')
  const credits = tickets.reduce((s, t) => s + t.credits_issued, 0)
  const recovered = tickets.reduce((s, t) => s + t.back_billed, 0)

  const rows = useMemo(() => {
    let r = tickets
    if (status === 'OPEN') r = r.filter((t) => t.status !== 'resolved')
    else if (status !== 'ALL') r = r.filter((t) => t.status === status)
    if (category !== 'ALL') r = r.filter((t) => t.category === category)
    const needle = q.trim().toLowerCase()
    if (needle) {
      r = r.filter((t) =>
        t.customer_name.toLowerCase().includes(needle) ||
        t.account_number.toLowerCase().includes(needle) ||
        (t.ticket_code || '').toLowerCase().includes(needle) ||
        (t.service_address || '').toLowerCase().includes(needle))
    }
    return r
  }, [tickets, status, category, q])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Customer discrepancies &amp; adjustments</div>
          <div className="hero-value" style={{ fontSize: 28 }}>Utility billing</div>
          <div className="hero-sub">
            {open.length} open tickets · {overdue.length} overdue ·{' '}
            {fmtFull(credits)} credited / {fmtFull(recovered)} recovered to date
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="seg" role="group" aria-label="Billing tracker view">
          {[['tickets', 'Tickets'], ['recon', 'Reconciliation'], ['guide', 'User guide']].map(([k, v]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{v}</button>
          ))}
        </span>
        {canWrite && tab === 'tickets' && (
          <button className="btn small primary" onClick={() => setNewOpen(true)}>
            <Plus /> Log discrepancy
          </button>
        )}
      </div>

      {tab === 'tickets' && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="s-label">Open tickets</div>
              <div className="s-value">{open.length}</div>
              <div className="s-note">{tickets.length} total logged</div>
            </div>
            <div className="stat">
              <div className="s-label">Overdue</div>
              <div className="s-value" style={{ color: overdue.length ? 'var(--critical)' : undefined }}>
                {overdue.length}
              </div>
              <div className="s-note">past the resolution deadline</div>
            </div>
            <div className="stat">
              <div className="s-label">Pending approval</div>
              <div className="s-value">{pending.length}</div>
              <div className="s-note">awaiting the approval matrix</div>
            </div>
            <div className="stat">
              <div className="s-label">Net revenue impact</div>
              <div className="s-value">{fmtFull(recovered - credits)}</div>
              <div className="s-note">{fmtFull(recovered)} recovered − {fmtFull(credits)} credited</div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow">Digital tracking log</div>
                <h2>Discrepancy tickets</h2>
                <div className="c-sub" style={{ marginBottom: 0 }}>
                  Click a ticket to review it, update the workflow, or record an adjustment
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}
                      aria-label="Filter by status">
                <option value="OPEN">Open (not resolved)</option>
                <option value="ALL">All statuses</option>
                {Object.entries(BILLING_STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}
                      aria-label="Filter by category">
                <option value="ALL">All categories</option>
                {Object.entries(BILLING_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input className="input" placeholder="Search tickets…" value={q}
                     onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
              <button className="btn small" onClick={() =>
                downloadCsv(
                  'billing-discrepancy-log.csv',
                  ['Ticket', 'Account', 'Customer', 'Service', 'Category', 'Source',
                   'Status', 'Priority', 'Owner', 'Received', 'Deadline',
                   'Original bill', 'Disputed', 'Credits', 'Back-billed'],
                  rows.map((t) => [
                    t.ticket_code, t.account_number, t.customer_name,
                    billingServiceLabel(t.utility_service), billingCategoryLabel(t.category),
                    billingSourceLabel(t.source), billingStatusLabel(t.status), t.priority,
                    t.ticket_owner || '', t.date_received, t.resolution_deadline || '',
                    t.original_bill_amount ?? '', t.disputed_bill_amount ?? '',
                    t.credits_issued, t.back_billed,
                  ]),
                )}>
                <Download /> Export CSV
              </button>
            </div>
            <DataTable
              columns={[
                {
                  key: 'ticket_code', label: 'Ticket',
                  render: (t) => (
                    <>
                      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{t.ticket_code}</span>
                      <div className="cell-sub">{billingSourceLabel(t.source)}</div>
                    </>
                  ),
                },
                {
                  key: 'customer_name', label: 'Customer / account',
                  render: (t) => (
                    <>
                      {t.customer_name}
                      <div className="cell-sub">{t.account_number}</div>
                    </>
                  ),
                },
                { key: 'utility_service', label: 'Service', render: (t) => billingServiceLabel(t.utility_service) },
                { key: 'category', label: 'Category', render: (t) => billingCategoryLabel(t.category) },
                {
                  key: 'priority', label: 'Priority',
                  sortValue: (t) => ({ low: 0, medium: 1, high: 2 }[t.priority]),
                  render: (t) => (
                    <span style={{ color: PRIORITY_TONE[t.priority], fontWeight: 600, fontSize: 12.5 }}>
                      {BILLING_PRIORITIES[t.priority]}
                    </span>
                  ),
                },
                { key: 'ticket_owner', label: 'Owner', render: (t) => t.ticket_owner || '—' },
                {
                  key: 'resolution_deadline', label: 'Received → deadline',
                  sortValue: (t) => t.date_received,
                  render: (t) => (
                    <>
                      {t.date_received} <span style={{ color: 'var(--ink-3)' }}>→</span>{' '}
                      <span className={t.is_overdue ? 'neg' : ''} style={{ fontWeight: t.is_overdue ? 650 : undefined }}>
                        {t.resolution_deadline || '—'}
                        {t.is_overdue ? ' !' : ''}
                      </span>
                    </>
                  ),
                },
                {
                  key: 'disputed_bill_amount', label: 'Disputed', numeric: true,
                  render: (t) => (t.disputed_bill_amount == null ? '—' : fmtFull(t.disputed_bill_amount)),
                },
                {
                  key: 'net', label: 'Adjusted', numeric: true,
                  sortValue: (t) => t.credits_issued + t.back_billed,
                  render: (t) => (t.adjustment_count === 0 ? '—'
                    : <>{t.credits_issued > 0 && <span className="neg">−{fmtFull(t.credits_issued).slice(1)}</span>}
                        {t.credits_issued > 0 && t.back_billed > 0 && ' / '}
                        {t.back_billed > 0 && <span style={{ color: 'var(--good)' }}>+{fmtFull(t.back_billed).slice(1)}</span>}</>),
                },
                { key: 'status', label: 'Status', render: (t) => <StatusChip status={t.status} /> },
                              {
                  key: 'del', label: '', sortable: false, numeric: true,
                  render: (t) => <DeleteButton entity="billing_ticket" id={t.ticket_id} name={t.ticket_code} />,
                },
              ]}
              rows={rows}
              rowKey={(t) => t.ticket_id}
              onRowClick={(t) => setDetail(t)}
              initialSort={{ key: 'resolution_deadline', dir: -1 }}
            />
          </div>
        </>
      )}

      {tab === 'recon' && (
        <div className="card">
          <div className="eyebrow"><Scale size={12} style={{ verticalAlign: '-1px' }} /> Weekly audit</div>
          <h2>Reconciliation</h2>
          <div className="c-sub">
            The supervisor compares each week's logged adjustments against the
            credits issued in the utility billing ledger; a missing JE count
            other than zero means the $50 journal-entry rule was bypassed
            outside this system
          </div>
          <DataTable
            columns={[
              { key: 'week', label: 'Week' },
              { key: 'week_start', label: 'Starting' },
              { key: 'adjustments', label: 'Adjustments', numeric: true },
              { key: 'credits_issued', label: 'Credits issued', numeric: true, render: (r) => fmtFull(r.credits_issued) },
              { key: 'back_billed', label: 'Back-billed', numeric: true, render: (r) => fmtFull(r.back_billed) },
              {
                key: 'net_revenue_impact', label: 'Net impact', numeric: true,
                render: (r) => (
                  <span className={r.net_revenue_impact < 0 ? 'neg' : ''} style={{ fontWeight: 650 }}>
                    {fmtFull(r.net_revenue_impact)}
                  </span>
                ),
              },
              {
                key: 'missing_je_refs', label: 'Missing JE refs', numeric: true,
                render: (r) => (r.missing_je_refs
                  ? <span className="neg"><AlertTriangle size={12} /> {r.missing_je_refs}</span>
                  : '0'),
              },
            ]}
            rows={recon}
            rowKey={(r) => r.week}
            initialSort={{ key: 'week', dir: -1 }}
            footer={[
              { content: `${recon.length} audited weeks`, colSpan: 2 },
              { content: recon.reduce((s, r) => s + r.adjustments, 0), numeric: true },
              { content: fmtFull(recon.reduce((s, r) => s + r.credits_issued, 0)), numeric: true },
              { content: fmtFull(recon.reduce((s, r) => s + r.back_billed, 0)), numeric: true },
              { content: fmtFull(recon.reduce((s, r) => s + r.net_revenue_impact, 0)), numeric: true },
              { content: '' },
            ]}
          />
        </div>
      )}

      {tab === 'guide' && (
        <>
          <div className="c-sub" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 0 }}>
            <BookOpen size={14} /> Tracker User Guide — the standard operating
            procedure for the billing adjustment log
          </div>
          <GuideTab />
        </>
      )}

      <NewTicketModal open={newOpen} onClose={() => setNewOpen(false)} />
      <TicketDetailModal ticket={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
