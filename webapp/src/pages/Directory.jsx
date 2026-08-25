import { useMemo, useState } from 'react'
import { Plus, Users, Building, Landmark } from 'lucide-react'
import { useApp, useToast } from '../state/AppContext'
import { api } from '../lib/api'
import { fmtFull } from '../lib/format'
import DataTable from '../components/DataTable'

/** Inline add form: a name plus an optional second field. */
function AddForm({ label, extraLabel, extraKey, endpoint, onDone }) {
  const { refresh, guard } = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const body = { name: f.get('name') }
      if (extraKey) body[extraKey] = f.get('extra')
      const r = await api(endpoint, { method: 'POST', body: JSON.stringify(body) })
      toast(`Added ${r.name}`)
      setOpen(false)
      refresh()
      if (onDone) onDone(r)
    } catch (ex) {
      if (!guard(ex)) setErr(ex.message)
    }
  }

  if (!open) {
    return (
      <button className="btn small" onClick={() => setOpen(true)}>
        <Plus /> Add {label}
      </button>
    )
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input className="input" name="name" placeholder={label + ' name'} required autoFocus
             style={{ width: 220 }} />
      {extraLabel && (
        <input className="input" name="extra" placeholder={extraLabel} style={{ width: 170 }} />
      )}
      <button className="btn small primary" type="submit">Save</button>
      <button className="btn small ghost" type="button" onClick={() => { setOpen(false); setErr('') }}>
        Cancel
      </button>
      {err && <span style={{ color: 'var(--critical)', fontSize: 12.5 }}>{err}</span>}
    </form>
  )
}

export default function Directory() {
  const { data, canWrite } = useApp()

  const subTotals = useMemo(() => {
    const m = new Map()
    for (const r of data.expenditures || []) {
      if (!r.subrecipient_name) continue
      const cur = m.get(r.subrecipient_name) || { total: 0, payments: 0 }
      cur.total += r.to_sub
      cur.payments += 1
      m.set(r.subrecipient_name, cur)
    }
    return m
  }, [data])

  const deptTotals = useMemo(() => {
    const m = new Map()
    for (const r of data.expenditures || []) {
      if (!r.department_name) continue
      const cur = m.get(r.department_name) || { total: 0, txns: 0 }
      cur.total += r.amount
      cur.txns += 1
      m.set(r.department_name, cur)
    }
    return m
  }, [data])

  const ptCounts = useMemo(() => {
    const m = new Map()
    for (const a of data.awards) {
      if (!a.pass_through_name) continue
      m.set(a.pass_through_name, (m.get(a.pass_through_name) || 0) + 1)
    }
    return m
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="eyebrow">Reference data</div>
        <div className="hero-value" style={{ fontSize: 28 }}>Directory</div>
        <div className="hero-sub">
          The people and entities grants flow through — add them here, or straight from the
          entry forms with “Add new…”
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="doc-ico" style={{ width: 34, height: 34 }}><Users /></div>
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>Subrecipients</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              Organizations the city passes federal money down to (2 CFR 200.332 monitoring)
            </div>
          </div>
          {canWrite && <AddForm label="subrecipient" extraLabel="UEI (optional)"
                                extraKey="uei" endpoint="/api/subrecipient" />}
        </div>
        <DataTable
          columns={[
            { key: 'subrecipient_name', label: 'Name' },
            { key: 'subrecipient_uei', label: 'UEI', render: (r) => r.subrecipient_uei || '—' },
            {
              key: 'payments', label: 'Payments', numeric: true,
              sortValue: (r) => (subTotals.get(r.subrecipient_name) || {}).payments || 0,
              render: (r) => String((subTotals.get(r.subrecipient_name) || {}).payments || 0),
            },
            {
              key: 'total', label: 'Total passed down', numeric: true,
              sortValue: (r) => (subTotals.get(r.subrecipient_name) || {}).total || 0,
              render: (r) => fmtFull((subTotals.get(r.subrecipient_name) || {}).total || 0),
            },
          ]}
          rows={data.subrecipient_list || []}
          rowKey={(r) => r.subrecipient_id}
          initialSort={{ key: 'total', dir: -1 }}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="doc-ico" style={{ width: 34, height: 34 }}><Building /></div>
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>Departments</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              City departments that charge expenditures to grants
            </div>
          </div>
          {canWrite && <AddForm label="department" endpoint="/api/department" />}
        </div>
        <DataTable
          columns={[
            { key: 'department_name', label: 'Name' },
            {
              key: 'txns', label: 'Transactions', numeric: true,
              sortValue: (r) => (deptTotals.get(r.department_name) || {}).txns || 0,
              render: (r) => String((deptTotals.get(r.department_name) || {}).txns || 0),
            },
            {
              key: 'total', label: 'Total spent', numeric: true,
              sortValue: (r) => (deptTotals.get(r.department_name) || {}).total || 0,
              render: (r) => fmtFull((deptTotals.get(r.department_name) || {}).total || 0),
            },
          ]}
          rows={data.department_list || []}
          rowKey={(r) => r.department_id}
          initialSort={{ key: 'total', dir: -1 }}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="doc-ico" style={{ width: 34, height: 34 }}><Landmark /></div>
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>Pass-through entities</h2>
            <div className="c-sub" style={{ marginBottom: 0 }}>
              State agencies that hand federal money down to the city
            </div>
          </div>
          {canWrite && <AddForm label="pass-through entity" extraLabel="Their award # (optional)"
                                extraKey="award_number" endpoint="/api/passthrough" />}
        </div>
        <DataTable
          columns={[
            { key: 'pass_through_name', label: 'Name' },
            {
              key: 'pass_through_award_number', label: 'Identifying award #',
              render: (r) => r.pass_through_award_number || '—',
            },
            {
              key: 'awards', label: 'Awards flowing through', numeric: true,
              sortValue: (r) => ptCounts.get(r.pass_through_name) || 0,
              render: (r) => String(ptCounts.get(r.pass_through_name) || 0),
            },
          ]}
          rows={data.pass_through_list || []}
          rowKey={(r) => r.pass_through_id}
          initialSort={{ key: 'awards', dir: -1 }}
        />
      </div>
    </div>
  )
}
