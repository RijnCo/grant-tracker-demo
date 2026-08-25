import { useState } from 'react'
import Modal from '../Modal'
import { api } from '../../lib/api'
import { fmtFull } from '../../lib/format'
import { useApp, useToast } from '../../state/AppContext'

/**
 * Record an award amendment: move the period of performance, add (or
 * de-obligate) funding, or both. The change is applied to the award and the
 * full before/after is kept forever in the amendment history.
 */
export default function AmendmentModal({ open, onClose, award }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => { setErr(''); onClose() }

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    setBusy(true)
    try {
      const r = await api('/api/amendment', {
        method: 'POST',
        body: JSON.stringify({
          award_id: award.award_id,
          amendment_date: f.get('amendment_date'),
          new_period_start: f.get('new_period_start'),
          new_period_end: f.get('new_period_end'),
          amount_change: f.get('amount_change') || 0,
          description: f.get('description'),
        }),
      })
      toast(`Amendment ${r.amendment_number} recorded — current award ${fmtFull(r.budget)}, ` +
            `period ${r.period_start} → ${r.period_end}`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  if (!award) return null
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>Record amendment</h3>
        <div className="m-sub">
          {award.award_name} — currently {fmtFull(award.budget)} through {award.award_period_end || '—'}.
          Leave a field unchanged to keep it as is.
        </div>
        <label htmlFor="am-date">Amendment date</label>
        <input id="am-date" name="amendment_date" type="date" required />
        <div className="row2">
          <div>
            <label htmlFor="am-start">New period of performance start</label>
            <input id="am-start" name="new_period_start" type="date"
                   defaultValue={award.award_period_start || ''} />
          </div>
          <div>
            <label htmlFor="am-end">New period of performance end</label>
            <input id="am-end" name="new_period_end" type="date"
                   defaultValue={award.award_period_end || ''} />
          </div>
        </div>
        <label htmlFor="am-amount">Funding change ($ — positive adds, negative de-obligates)</label>
        <input id="am-amount" name="amount_change" type="number" step="0.01"
               placeholder="0.00" />
        <label htmlFor="am-desc">Reason / description</label>
        <input id="am-desc" name="description"
               placeholder="Amendment 2: period extended per grantor letter dated…" />
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Recording…' : 'Record amendment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
