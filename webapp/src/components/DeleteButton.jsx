import { useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import Modal from './Modal'

/**
 * Delete affordance for any record the server's DELETABLE registry allows.
 *
 * Clicking it runs a preflight (/api/delete-check) before showing anything,
 * so the dialog can state the actual consequence: what will go with it, or
 * exactly what is standing in the way. Financial records require a typed
 * reason — the server enforces that too, this just asks for it up front.
 *
 *   <DeleteButton entity="department" id={d.department_id}
 *                 name={d.department_name} onDone={refresh} />
 */
export default function DeleteButton({ entity, id, name, label, small = true, onDone }) {
  const { refresh, guard, canWrite } = useApp()
  const toast = useToast()
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  if (!canWrite) return null

  const open = async (e) => {
    e.stopPropagation()
    setErr('')
    setReason('')
    try {
      setCheck(await api('/api/delete-check', {
        method: 'POST', body: JSON.stringify({ entity, id }),
      }))
    } catch (ex) {
      if (!guard(ex)) toast(ex.message, true)
    }
  }

  const close = () => { setCheck(null); setErr(''); setReason('') }

  const confirm = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const r = await api('/api/delete', {
        method: 'POST', body: JSON.stringify({ entity, id, reason }),
      })
      toast(`Deleted ${r.noun} "${r.label}".`)
      close()
      if (onDone) onDone()
      else refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  const shown = name || check?.label || 'this record'
  return (
    <>
      <button
        className={'btn ghost icon del' + (small ? ' small' : '')}
        title={label || 'Delete'}
        aria-label={`Delete ${shown}`}
        onClick={open}
      >
        <Trash2 />
      </button>

      <Modal open={!!check} onClose={close}>
        {check && (check.ok ? (
          <form onSubmit={confirm}>
            <h3>Delete this {check.noun}?</h3>
            <div className="m-sub">
              <b>{check.label}</b> will be removed.
              {check.financial
                ? ' This is a financial record — the removal is written to the audit trail with the full contents of the row and the reason you give below.'
                : ' The removal is recorded in the deletion log, but it stays off the audit trail — this is reference data, not a financial record.'}
            </div>
            {check.cascade?.length > 0 && (
              <div className="m-sub" style={{ color: 'var(--warning)' }}>
                Also removed with it:{' '}
                {check.cascade.map((c) => `${c.count} × ${c.table.replace(/_/g, ' ')}`).join(', ')}.
              </div>
            )}
            {check.requires_reason && (
              <>
                <label htmlFor="del-reason">Reason for removal</label>
                <input id="del-reason" value={reason} autoFocus
                       onChange={(ev) => setReason(ev.target.value)}
                       placeholder="e.g. duplicate entry, keyed against the wrong award" />
              </>
            )}
            <div className="err">{err}</div>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              <button type="submit" className="btn danger" disabled={busy}>
                {busy ? 'Deleting…' : `Delete ${check.noun}`}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h3>This {check.noun} can’t be deleted yet</h3>
            <div className="m-sub">
              <b>{check.label}</b> is still referenced by{' '}
              {check.blockers.join(', ')}. Remove or reassign those first —
              deleting it now would leave that history pointing at nothing.
            </div>
            <div className="m-sub" style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <TriangleAlert size={15} style={{ flex: 'none', marginTop: 1, color: 'var(--warning)' }} />
              <span>
                Anything described as a permanent record — an amendment, a
                pacing alert, a status-history entry — cannot be removed at
                all, so records carrying that history stay put by design.
              </span>
            </div>
            <div className="actions">
              <button type="button" className="btn primary" onClick={close}>Close</button>
            </div>
          </div>
        ))}
      </Modal>
    </>
  )
}
