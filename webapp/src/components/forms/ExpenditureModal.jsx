import { useState } from 'react'
import Modal from '../Modal'
import { api } from '../../lib/api'
import { fmtCompact, fmtFull } from '../../lib/format'
import { useApp, useToast } from '../../state/AppContext'

const today = () => new Date().toISOString().slice(0, 10)

export default function ExpenditureModal({ open, onClose, defaultAwardId }) {
  const { lookups, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [newSub, setNewSub] = useState(false)
  const close = () => { setNewSub(false); setErr(''); onClose() }

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    setBusy(true)
    try {
      let subId = f.get('subrecipient_id') || null
      if (subId === '__new') {
        const s = await api('/api/subrecipient', {
          method: 'POST',
          body: JSON.stringify({ name: f.get('ns_name'), uei: f.get('ns_uei') }),
        })
        subId = s.id
        toast(`Added subrecipient ${s.name}`)
      }
      const r = await api('/api/expenditure', {
        method: 'POST',
        body: JSON.stringify({
          award_id: f.get('award_id'),
          department_id: f.get('department_id'),
          amount: f.get('amount'),
          transaction_date: f.get('transaction_date'),
          description: f.get('description'),
          doc_reference: f.get('doc_reference'),
          subrecipient_id: subId,
          amount_to_subrecipient: f.get('amount_to_subrecipient') || 0,
        }),
      })
      toast(`Saved — ${r.award_name} now has ${fmtFull(r.remaining)} remaining of ${fmtFull(r.budget)}.`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  if (!lookups) return null
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>Record expenditure</h3>
        <div className="m-sub">
          Posts through the database triggers — rollup, audit log, and over-spend control apply.
        </div>
        <label htmlFor="exp-award">Grant award</label>
        <select id="exp-award" name="award_id" required defaultValue={defaultAwardId || undefined}>
          {lookups.awards.map((a) => (
            <option key={a.award_id} value={a.award_id}>
              {a.award_name} — {fmtCompact((a.budget || 0) - a.spent)} remaining
            </option>
          ))}
        </select>
        <div className="row2">
          <div>
            <label htmlFor="exp-amount">Amount ($)</label>
            <input id="exp-amount" name="amount" type="number" step="0.01" required autoFocus />
          </div>
          <div>
            <label htmlFor="exp-date">Transaction date</label>
            <input id="exp-date" name="transaction_date" type="date" required defaultValue={today()} />
          </div>
        </div>
        <label htmlFor="exp-dept">Department</label>
        <select id="exp-dept" name="department_id" required>
          {lookups.departments.map((d) => (
            <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
          ))}
        </select>
        <label htmlFor="exp-desc">Description</label>
        <input id="exp-desc" name="description" placeholder="Contractor progress payment…" />
        <label htmlFor="exp-doc">Document reference</label>
        <input id="exp-doc" name="doc_reference" placeholder="INV-2026-01234" />
        <div className="row2">
          <div>
            <label htmlFor="exp-sub">Subrecipient (optional)</label>
            <select id="exp-sub" name="subrecipient_id" defaultValue=""
                    onChange={(e) => setNewSub(e.target.value === '__new')}>
              <option value="">— none —</option>
              {lookups.subrecipients.map((s) => (
                <option key={s.subrecipient_id} value={s.subrecipient_id}>{s.subrecipient_name}</option>
              ))}
              <option value="__new">Don’t see them? Add new…</option>
            </select>
          </div>
          <div>
            <label htmlFor="exp-subamt">Amount to subrecipient ($)</label>
            <input id="exp-subamt" name="amount_to_subrecipient" type="number" step="0.01" defaultValue="0" />
          </div>
        </div>
        {newSub && (
          <div className="row2">
            <div>
              <label htmlFor="ns-name">New subrecipient name</label>
              <input id="ns-name" name="ns_name" placeholder="Bay Harbor Community Fund" required />
            </div>
            <div>
              <label htmlFor="ns-uei">UEI (optional)</label>
              <input id="ns-uei" name="ns_uei" placeholder="ABCD1EFGH234" />
            </div>
          </div>
        )}
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save expenditure'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
