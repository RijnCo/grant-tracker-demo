import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Droplets, Plus, Store } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { fmtCompact, fmtFull } from '../lib/format'
import {
  BTR_STATUSES, billingCategoryLabel, btrStatusLabel,
} from '../lib/labels'
import DataTable from '../components/DataTable'
import DeleteButton from '../components/DeleteButton'
import Modal from '../components/Modal'

const BTR_TONE = {
  identified: 'var(--warning)',
  notice_sent: 'var(--accent)',
  registered: 'var(--good)',
  exempt: 'var(--ink-3)',
  referred: 'var(--critical)',
}

function BtrCaseModal({ open, onClose }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      await api('/api/btr-case', {
        method: 'POST',
        body: JSON.stringify({
          business_name: f.get('business_name'),
          business_address: f.get('business_address'),
          identified_date: f.get('identified_date'),
          estimated_annual_tax: f.get('estimated_annual_tax'),
          notes: f.get('notes'),
        }),
      })
      toast('Compliance case opened.')
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
        <h3>New compliance case</h3>
        <div className="m-sub">
          A business found operating in the city without a current business
          tax receipt (Ch. 205, F.S.).
        </div>
        <label htmlFor="bc-name">Business name</label>
        <input id="bc-name" name="business_name" required />
        <label htmlFor="bc-addr">Business address</label>
        <input id="bc-addr" name="business_address" />
        <div className="row2">
          <div>
            <label htmlFor="bc-date">Identified on</label>
            <input id="bc-date" name="identified_date" type="date" />
          </div>
          <div>
            <label htmlFor="bc-est">Estimated annual tax ($)</label>
            <input id="bc-est" name="estimated_annual_tax" type="number" step="0.01" min="0" />
          </div>
        </div>
        <label htmlFor="bc-notes">Notes</label>
        <input id="bc-notes" name="notes" placeholder="How the business was identified" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Open case</button>
        </div>
      </form>
    </Modal>
  )
}

function BtrUpdateModal({ btrCase, onClose }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  if (!btrCase) return null
  const close = () => { setErr(''); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      await api('/api/btr-case-update', {
        method: 'POST',
        body: JSON.stringify({
          case_id: btrCase.case_id,
          case_status: f.get('case_status'),
          notice_date: f.get('notice_date'),
          collected_amount: f.get('collected_amount'),
          notes: f.get('notes'),
        }),
      })
      toast(`Updated case for ${btrCase.business_name}.`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    }
  }
  return (
    <Modal open={!!btrCase} onClose={close}>
      <form onSubmit={submit}>
        <h3>{btrCase.business_name}</h3>
        <div className="m-sub">
          {btrCase.business_address || 'No address on file'} · identified {btrCase.identified_date || '—'}
          · est. annual tax {btrCase.estimated_annual_tax == null ? '—' : fmtFull(btrCase.estimated_annual_tax)}
        </div>
        <div className="row2">
          <div>
            <label htmlFor="bu-status">Case status</label>
            <select id="bu-status" name="case_status" defaultValue={btrCase.case_status}>
              {Object.entries(BTR_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bu-notice">Notice date</label>
            <input id="bu-notice" name="notice_date" type="date" defaultValue={btrCase.notice_date || ''} />
          </div>
        </div>
        <label htmlFor="bu-coll">Collected ($)</label>
        <input id="bu-coll" name="collected_amount" type="number" step="0.01" min="0"
               defaultValue={btrCase.collected_amount || 0} />
        <label htmlFor="bu-notes">Notes</label>
        <input id="bu-notes" name="notes" defaultValue={btrCase.notes || ''} />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary">Save case</button>
        </div>
      </form>
    </Modal>
  )
}

/** Revenue integrity: NRW audit, BTR compliance (Ch. 205 F.S.), and ICAP. */
export default function Integrity() {
  const { data, canWrite } = useApp()
  const [caseOpen, setCaseOpen] = useState(false)
  const [caseDetail, setCaseDetail] = useState(null)
  const [icapFySel, setIcapFySel] = useState(null)

  const nrw = useMemo(
    () => (data.billing_tickets || []).filter((t) => t.source === 'field_audit'),
    [data])
  const nrwRecovered = nrw.reduce((s, t) => s + t.back_billed, 0)
  const btr = data.btr_cases || []
  const btrIdentified = btr.reduce((s, c) => s + (c.estimated_annual_tax || 0), 0)
  const btrCollected = btr.reduce((s, c) => s + (c.collected_amount || 0), 0)
  const icap = data.icap_allocations || []
  const icapFys = [...new Set(icap.map((r) => r.fy_label))]
  const icapFy = icapFySel && icapFys.includes(icapFySel)
    ? icapFySel : icapFys[icapFys.length - 1]
  const icapRows = icap.filter((r) => r.fy_label === icapFy)
  const icapStatus = icapRows[0]?.plan_status
  const icapByFund = useMemo(() => {
    const m = new Map()
    for (const r of icapRows) {
      if (!m.has(r.paying_fund)) m.set(r.paying_fund, { fund: r.paying_fund, services: [], total: 0 })
      const f = m.get(r.paying_fund)
      f.services.push(r)
      f.total += r.annual_amount
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [icapRows])
  const icapTotal = icapRows.reduce((s, r) => s + r.annual_amount, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="eyebrow">Finding the money the city already earns</div>
        <div className="hero-value" style={{ fontSize: 28 }}>Revenue integrity</div>
        <div className="hero-sub">
          {fmtCompact(nrwRecovered)} recovered by the water audit ·{' '}
          {fmtCompact(btrIdentified)}/yr in unregistered business tax
          {icapFys.length > 0 && <> ·{' '}
            {fmtCompact(icapTotal)} {icapStatus === 'proposed' ? 'proposed' : 'adopted'} indirect
            cost recovery ({icapFy})</>}
        </div>
      </div>

      <div className="grid">
        <div className="card span-5">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div className="doc-ico" style={{ width: 34, height: 34 }}><Droplets /></div>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Non-revenue water audit</div>
              <h2>Lost water, lost revenue</h2>
              <div className="c-sub">
                Under-registering meters, inactive-but-consuming accounts, and
                unmetered connections are lost revenue, not a rate problem.
                Findings are worked as field-audit tickets in the billing tracker.
              </div>
            </div>
          </div>
          {nrw.map((t) => (
            <div key={t.ticket_id} style={{ padding: '8px 0', borderTop: '1px solid var(--grid)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 550 }}>
                  {t.customer_name}
                  <span className="cell-sub" style={{ display: 'inline', marginLeft: 8 }}>
                    {billingCategoryLabel(t.category)}
                  </span>
                </span>
                <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {t.back_billed > 0
                    ? <span style={{ color: 'var(--good)', fontWeight: 650 }}>+{fmtFull(t.back_billed).slice(1)}</span>
                    : <span style={{ color: 'var(--ink-3)' }}>{t.status === 'resolved' ? 'closed' : 'in progress'}</span>}
                </span>
              </div>
              <div className="cell-sub">{t.ticket_code} · {t.date_received}</div>
            </div>
          ))}
          <Link to="/billing" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12,
            fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
          }}>
            Open the billing tracker <ArrowUpRight size={13} />
          </Link>
        </div>

        <div className="card span-7">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div className="doc-ico" style={{ width: 34, height: 34 }}><Store /></div>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Ch. 205, Florida Statutes</div>
              <h2>Business tax receipt compliance</h2>
              <div className="c-sub" style={{ marginBottom: 0 }}>
                Businesses operating in the city without a current registration ·{' '}
                {fmtFull(btrCollected)} collected so far
              </div>
            </div>
            {canWrite && (
              <button className="btn small" onClick={() => setCaseOpen(true)}>
                <Plus /> New case
              </button>
            )}
          </div>
          <DataTable
            columns={[
              {
                key: 'business_name', label: 'Business',
                render: (c) => (
                  <>
                    {c.business_name}
                    <div className="cell-sub">{c.business_address || '—'}</div>
                  </>
                ),
              },
              { key: 'identified_date', label: 'Identified' },
              { key: 'notice_date', label: 'Notice', render: (c) => c.notice_date || '—' },
              {
                key: 'estimated_annual_tax', label: 'Est. tax / yr', numeric: true,
                render: (c) => (c.estimated_annual_tax == null ? '—' : fmtFull(c.estimated_annual_tax)),
              },
              {
                key: 'collected_amount', label: 'Collected', numeric: true,
                render: (c) => (c.collected_amount ? fmtFull(c.collected_amount) : '—'),
              },
              {
                key: 'case_status', label: 'Status',
                render: (c) => (
                  <span style={{ color: BTR_TONE[c.case_status], fontWeight: 600, fontSize: 12.5 }}>
                    {btrStatusLabel(c.case_status)}
                  </span>
                ),
              },
                          {
                key: 'del', label: '', sortable: false, numeric: true,
                render: (c) => <DeleteButton entity="btr_case" id={c.case_id} name={c.business_name} />,
              },
            ]}
            rows={btr}
            rowKey={(c) => c.case_id}
            onRowClick={canWrite ? (c) => setCaseDetail(c) : undefined}
            initialSort={{ key: 'identified_date', dir: -1 }}
          />
        </div>

        <div className="card span-12">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Indirect cost allocation plan</div>
              <h2>General Fund reimbursement</h2>
              <div className="c-sub" style={{ marginBottom: 0 }}>
                Central administrative services (HR, IT, Legal, City Manager,
                Clerk, Finance) charged to the enterprise funds, grant programs,
                and CRA so each operation carries its proportionate share —{' '}
                {icapFys.length === 0
                  ? 'no allocation plan loaded yet'
                  : icapStatus === 'proposed'
                    ? `the ${icapFy} plan is proposed and under review`
                    : `the ${icapFy} plan is adopted`}
              </div>
            </div>
            <span className="seg" role="group" aria-label="ICAP plan year">
              {icapFys.map((fy) => (
                <button key={fy} aria-pressed={icapFy === fy} onClick={() => setIcapFySel(fy)}>{fy}</button>
              ))}
            </span>
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            {icapByFund.map((f) => (
              <div className="card span-6" key={f.fund} style={{ boxShadow: 'none', border: '1px solid var(--grid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <div className="c-sub" style={{ marginBottom: 4 }}>{f.fund}</div>
                  <div style={{ fontSize: 18, fontWeight: 650, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmtCompact(f.total)}<span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}> /yr</span>
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  {f.services.map((s) => (
                    <div key={s.allocation_id}
                         style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12.5,
                                  padding: '4px 0', borderTop: '1px solid var(--grid)' }}>
                      <span style={{ color: 'var(--ink-2)' }}>
                        {s.central_service}
                        <span className="cell-sub" style={{ display: 'inline', marginLeft: 8 }}>{s.allocation_basis}</span>
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtCompact(s.annual_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {icapFys.length > 0 && (
            <div className="c-sub" style={{ marginTop: 8, marginBottom: 0 }}>
              Total {icapFy} recovery to the General Fund: <b>{fmtFull(icapTotal)}</b>
            </div>
          )}
        </div>
      </div>

      <BtrCaseModal open={caseOpen} onClose={() => setCaseOpen(false)} />
      <BtrUpdateModal btrCase={caseDetail} onClose={() => setCaseDetail(null)} />
    </div>
  )
}
