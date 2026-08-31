import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ShieldCheck } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { downloadCsv, fmtFull } from '../lib/format'
import DataTable from '../components/DataTable'

const ACTIONS = ['ALL', 'INSERT', 'UPDATE', 'DELETE']

/**
 * Records removed from the system. Deleting is allowed — somebody types
 * "Watr Department" and needs it gone — but never silently: every removal is
 * snapshotted in the append-only deletion log. Financial removals (an award,
 * an expenditure, a receipt, an adjustment) carry a required reason and are
 * shown first; reference-data cleanup is folded away behind a toggle so it
 * does not crowd what an auditor came here to see.
 */
function RemovalsCard({ deletions }) {
  const [showRef, setShowRef] = useState(false)
  const financial = deletions.filter((d) => d.is_financial)
  const reference = deletions.filter((d) => !d.is_financial)
  const shown = showRef ? deletions : financial
  if (deletions.length === 0) return null

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Removals</div>
          <h2>What has been deleted</h2>
          <div className="c-sub" style={{ marginBottom: 0 }}>
            {financial.length} financial record{financial.length === 1 ? '' : 's'} removed
            {reference.length > 0 && ` · ${reference.length} reference-data cleanup${reference.length === 1 ? '' : 's'}`}
            {' '}· the deletion log itself cannot be edited or cleared
          </div>
        </div>
        {reference.length > 0 && (
          <span className="seg" role="group" aria-label="Removal scope">
            <button aria-pressed={!showRef} onClick={() => setShowRef(false)}>Financial</button>
            <button aria-pressed={showRef} onClick={() => setShowRef(true)}>Everything</button>
          </span>
        )}
      </div>
      <DataTable
        columns={[
          { key: 'deleted_at', label: 'When (UTC)' },
          {
            key: 'record_label', label: 'Record',
            render: (d) => (
              <>
                {d.record_label || `#${d.record_id}`}
                <div className="cell-sub">
                  {d.entity.replace(/_/g, ' ')} #{d.record_id}
                  {d.cascaded ? ` · also removed ${d.cascaded}` : ''}
                </div>
              </>
            ),
          },
          {
            key: 'is_financial', label: 'Kind',
            render: (d) => (d.is_financial
              ? <span style={{ color: 'var(--critical)', fontWeight: 650, fontSize: 12.5 }}>Financial</span>
              : <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Reference</span>),
          },
          { key: 'reason', label: 'Reason', render: (d) => d.reason || '—' },
          { key: 'deleted_by', label: 'Removed by', render: (d) => d.deleted_by || '—' },
        ]}
        rows={shown}
        rowKey={(d) => d.deletion_id}
        initialSort={{ key: 'deleted_at', dir: -1 }}
      />
    </div>
  )
}

export default function Audit() {
  const { data } = useApp()
  const [action, setAction] = useState('ALL')

  const rows = useMemo(
    () => (action === 'ALL' ? data.audit_trail : data.audit_trail.filter((r) => r.action === action)),
    [data, action],
  )

  const columns = [
    { key: 'changed_at', label: 'When (UTC)' },
    {
      key: 'action', label: 'Action',
      render: (r) => (
        <span className="dotlabel">
          <span className="dot" style={{
            background: r.action === 'INSERT' ? 'var(--good)'
              : r.action === 'UPDATE' ? 'var(--series-1)' : 'var(--critical)',
          }} />
          {r.action.toLowerCase()}
        </span>
      ),
    },
    {
      key: 'award_name', label: 'Grant',
      render: (r) => r.award_id
        ? <Link to={`/grants/${r.award_id}`} style={{ textDecoration: 'none' }}>{r.award_name || '—'}</Link>
        : (r.award_name || '—'),
    },
    { key: 'expenditure_id', label: 'Exp #', numeric: true },
    {
      key: 'amount', label: 'Amount', numeric: true, sortable: false,
      render: (r) => r.action === 'UPDATE'
        ? `${fmtFull(r.old_amount)} → ${fmtFull(r.new_amount)}`
        : fmtFull(r.action === 'DELETE' ? r.old_amount : r.new_amount),
    },
    {
      key: 'balance', label: 'Award balance (old → new)', numeric: true, sortable: false,
      render: (r) => r.new_award_balance == null ? '—'
        : `${fmtFull(r.old_award_balance)} → ${fmtFull(r.new_award_balance)}`,
    },
    {
      key: 'department', label: 'Department', sortable: false,
      render: (r) => r.new_department || r.old_department || '—',
    },
    { key: 'changed_by', label: 'By', render: (r) => r.changed_by || '—' },
  ]

  const exportCsv = () =>
    downloadCsv(
      'audit-trail.csv',
      ['When (UTC)', 'Action', 'Grant', 'Expenditure #', 'Old amount', 'New amount',
       'Old award balance', 'New award balance', 'Department', 'Changed by'],
      rows.map((r) => [
        r.changed_at, r.action, r.award_name || '', r.expenditure_id,
        r.old_amount ?? '', r.new_amount ?? '',
        r.old_award_balance ?? '', r.new_award_balance ?? '',
        r.new_department || r.old_department || '', r.changed_by || '',
      ]),
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }} data-tour="audit-log">
        <div className="doc-ico" style={{ width: 38, height: 38 }}><ShieldCheck /></div>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginTop: 0 }}>Append-only change log</h2>
          <div className="c-sub" style={{ marginBottom: 0 }}>
            Every insert, update, and delete on the expenditure table is recorded by database
            triggers with old and new values — the log itself rejects edits and deletes
            (2 CFR 200.334 record retention, 2 CFR 200.303 internal controls).
          </div>
        </div>
        <span className="seg" role="group" aria-label="Action filter">
          {ACTIONS.map((a) => (
            <button key={a} aria-pressed={action === a} onClick={() => setAction(a)}>
              {a === 'ALL' ? 'All' : a.toLowerCase()}
            </button>
          ))}
        </span>
      </div>

      <RemovalsCard deletions={data.deletions || []} />

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Expenditure changes</div>
            <h2>Audit trail</h2>
            <div className="c-sub">{rows.length} entries (most recent 50 kept in view)</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn small" onClick={exportCsv}><Download /> Export CSV</button>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.audit_id}
                   initialSort={{ key: 'changed_at', dir: -1 }} />
      </div>

      {data.login_audit && (
        <div className="card">
          <div className="eyebrow">Access log</div>
          <h2>Sign-in attempts</h2>
          <div className="c-sub">Success and failure, also append-only</div>
          <DataTable
            columns={[
              { key: 'attempted_at', label: 'When (UTC)' },
              { key: 'username', label: 'Username' },
              {
                key: 'success', label: 'Result',
                render: (r) => (
                  <span className="dotlabel">
                    <span className="dot" style={{ background: r.success ? 'var(--good)' : 'var(--critical)' }} />
                    {r.success ? 'success' : 'failed'}
                  </span>
                ),
              },
            ]}
            rows={data.login_audit}
            rowKey={(r) => r.login_audit_id}
            initialSort={{ key: 'attempted_at', dir: -1 }}
          />
        </div>
      )}
    </div>
  )
}
