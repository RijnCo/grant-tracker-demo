import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, FilePenLine } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { aggMonthly, expInScope } from '../lib/selectors'
import { downloadCsv, fmtCompact, fmtFull, fmtWhole, pctOf } from '../lib/format'
import { amendmentTypeLabel, stateAwardTypeLabel } from '../lib/labels'
import CountUp from '../components/CountUp'
import DataTable from '../components/DataTable'
import TrendChart from '../components/charts/TrendChart'
import DocsPanel from '../components/DocsPanel'
import SourceChip from '../components/SourceChip'
import AmendmentModal from '../components/forms/AmendmentModal'
import { usageColor } from '../components/UsageBar'

export default function GrantDetail() {
  const { id } = useParams()
  const awardId = Number(id)
  const { data, fy, canWrite } = useApp()
  const [amendOpen, setAmendOpen] = useState(false)
  const award = data.awards.find((a) => a.award_id === awardId)
  const exps = useMemo(() => expInScope(data, { fy, awardId }), [data, fy, awardId])
  const monthly = useMemo(() => aggMonthly(exps), [exps])

  if (!award) {
    return (
      <div className="card">
        <h2>Grant not found</h2>
        <div className="c-sub">It may have been removed.</div>
        <Link className="btn" to="/grants">Back to grants</Link>
      </div>
    )
  }

  const remaining = (award.budget || 0) - award.spent
  const pct = pctOf(award.spent, award.budget || 0)
  const scopeSpent = exps.reduce((s, r) => s + r.amount, 0)
  const toSub = exps.reduce((s, r) => s + r.to_sub, 0)
  const audits = data.audit_trail.filter((r) => r.award_id === awardId)
  const loans = data.loan_balances.filter((l) => l.award_id === awardId)
  const amendments = (data.amendments || []).filter((m) => m.award_id === awardId)
  const amended = award.budget !== award.original_amount

  const exportCsv = () =>
    downloadCsv(
      `${award.fain_or_ptin || 'grant'}-expenditures.csv`,
      ['Date', 'Fiscal year', 'Department', 'Description', 'Doc ref', 'Subrecipient', 'To subrecipient', 'Amount', 'Entered by'],
      exps.map((r) => [
        r.transaction_date, r.fy_label, r.department_name || '', r.description || '',
        r.doc_reference || '', r.subrecipient_name || '', r.to_sub, r.amount, r.entered_by || '',
      ]),
    )

  const regColumns = [
    { key: 'transaction_date', label: 'Date' },
    { key: 'department_name', label: 'Department', render: (r) => r.department_name || '—' },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    { key: 'doc_reference', label: 'Doc ref', render: (r) => r.doc_reference || '—' },
    {
      key: 'to_sub', label: 'To subrecipient', numeric: true,
      render: (r) => (r.to_sub ? fmtFull(r.to_sub) : '—'),
    },
    {
      key: 'amount', label: 'Amount', numeric: true,
      render: (r) => <span className={r.amount < 0 ? 'neg' : ''}>{fmtFull(r.amount)}</span>,
    },
    { key: 'entered_by', label: 'Entered by', render: (r) => r.entered_by || '—' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link className="backlink" to="/grants"><ArrowLeft /> All grants</Link>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <SourceChip source={award.funding_source} />
            {award.fain_or_ptin} · {award.funding_source === 'STATE' ? 'CSFA' : 'ALN'} {award.aln}
            {award.funding_source === 'STATE'
              ? ' · ' + stateAwardTypeLabel(award.state_award_type)
              : ' · ' + award.funding_path
                + (award.pass_through_name ? ' via ' + award.pass_through_name : '')}
            {award.award_date ? ' · awarded ' + award.award_date : ''}
          </div>
          <div className="hero-value" style={{ fontSize: 36 }}>
            <CountUp value={remaining} format={fmtWhole} /> <span style={{
              fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', letterSpacing: 0,
            }}>remaining</span>
          </div>
          <div className="hero-sub">
            {award.award_name} — {fmtWhole(award.spent)} spent of {fmtWhole(award.budget)} current award
            {amended ? ` (originally ${fmtWhole(award.original_amount)})` : ''}
          </div>
          <div className="cellbar" style={{ width: 'min(440px, 100%)', height: 7, marginTop: 10 }}>
            <i style={{ transform: `scaleX(${pct / 100})`, background: usageColor(pct) }} />
          </div>
        </motion.div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="s-label">Current award</div>
          <div className="s-value">{fmtCompact(award.budget || 0)}</div>
          <div className="s-note">
            {amended
              ? `originally ${fmtCompact(award.original_amount || 0)} · ${amendments.length} amendment${amendments.length === 1 ? '' : 's'}`
              : award.award_type}
          </div>
        </div>
        <div className="stat" data-tour="pop-stat">
          <div className="s-label">Period of performance</div>
          <div className="s-value" style={{ fontSize: 16 }}>
            {award.award_period_start
              ? `${award.award_period_start} → ${award.award_period_end}`
              : '—'}
          </div>
          <div className="s-note">
            {award.award_date ? `awarded ${award.award_date}` : '—'}
            {amendments.some((m) => m.new_period_start || m.new_period_end) ? ' · dates amended' : ''}
          </div>
        </div>
        <div className="stat">
          <div className="s-label">Spent in scope</div>
          <div className="s-value"><CountUp value={scopeSpent} format={fmtCompact} /></div>
          <div className="s-note">{fy === 'ALL' ? 'all fiscal years' : fy} · {exps.length} transactions</div>
        </div>
        <div className="stat">
          <div className="s-label">Program</div>
          <div className="s-value" style={{ fontSize: 16 }}>{award.aln}</div>
          <div className="s-note">{award.program_title} · {award.agency_name}</div>
        </div>
      </div>

      <div className="grid">
        <div className="card span-8">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div>
              <div className="eyebrow">Transaction ledger</div>
              <h2>Expenditure history</h2>
              <div className="c-sub">{fy === 'ALL' ? 'All fiscal years' : fy}</div>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn small" onClick={exportCsv}><Download /> Export CSV</button>
          </div>
          <DataTable
            columns={regColumns}
            rows={exps}
            rowKey={(r) => r.expenditure_id}
            initialSort={{ key: 'transaction_date', dir: -1 }}
            footer={[
              { content: `Total — ${exps.length} transaction${exps.length === 1 ? '' : 's'}`, colSpan: 4 },
              { content: fmtFull(toSub), numeric: true },
              { content: fmtFull(scopeSpent), numeric: true },
              { content: '' },
            ]}
          />
        </div>

        <div className="span-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" data-tour="amendments-card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="eyebrow">Modification history</div>
                <h2>Amendments</h2>
                <div className="c-sub">Period-of-performance and funding changes</div>
              </div>
              {canWrite && (
                <button className="btn small" onClick={() => setAmendOpen(true)}>
                  <FilePenLine /> Amend
                </button>
              )}
            </div>
            {amendments.length === 0 && (
              <div className="c-sub">No amendments — the award still runs on its original terms.</div>
            )}
            {amendments.map((m) => (
              <div key={m.amendment_id} style={{ padding: '8px 0', borderTop: '1px solid var(--grid)', fontSize: 12.5 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 650 }}>Amendment {m.amendment_number}</span>
                  <span className="cell-sub">{m.amendment_date} · {amendmentTypeLabel(m.amendment_type)}</span>
                </div>
                {(m.new_period_start || m.new_period_end) && (
                  <div className="cell-sub">
                    period {m.new_period_start && m.new_period_start !== m.old_period_start
                      ? `${m.old_period_start} → ${m.new_period_start} (start)` : ''}
                    {m.new_period_start && m.new_period_end ? ' · ' : ''}
                    {m.new_period_end && m.new_period_end !== m.old_period_end
                      ? `${m.old_period_end} → ${m.new_period_end} (end)` : ''}
                  </div>
                )}
                {m.amount_change !== 0 && (
                  <div className="cell-sub">
                    <span className={m.amount_change < 0 ? 'neg' : ''} style={{ fontWeight: 600 }}>
                      {m.amount_change > 0 ? '+' : ''}{fmtFull(m.amount_change)}
                    </span>
                    {' '}— award now {fmtFull(m.new_award_amount)}
                  </div>
                )}
                {m.description && <div className="cell-sub">{m.description}</div>}
                <div className="cell-sub">entered by {m.entered_by || '—'}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="eyebrow">Records</div>
            <h2>Documents</h2>
            <div className="c-sub">Award letters, amendments, invoices</div>
            <DocsPanel awardId={awardId} />
          </div>
          {loans.length > 0 && (
            <div className="card">
              <div className="eyebrow">2 CFR 200.510(b)(5)</div>
              <h2>Loan balances</h2>
              <div className="c-sub">Outstanding at fiscal year end</div>
              <DataTable
                columns={[
                  { key: 'fy_label', label: 'Fiscal year' },
                  { key: 'outstanding_balance', label: 'Balance', numeric: true, render: (l) => fmtFull(l.outstanding_balance) },
                ]}
                rows={loans}
                rowKey={(l) => l.fy_label}
              />
            </div>
          )}
          <div className="card">
            <div className="eyebrow">2 CFR 200.334</div>
            <h2>Audit entries</h2>
            <div className="c-sub">Changes touching this grant</div>
            {audits.length === 0 && <div className="c-sub">No audit entries.</div>}
            {audits.slice(0, 8).map((r) => (
              <div key={r.audit_id} style={{ padding: '7px 0', borderTop: '1px solid var(--grid)', fontSize: 12.5 }}>
                <span className="dotlabel">
                  <span className="dot" style={{
                    background: r.action === 'INSERT' ? 'var(--good)'
                      : r.action === 'UPDATE' ? 'var(--series-1)' : 'var(--critical)',
                  }} />
                  {r.action.toLowerCase()} · {fmtFull(r.action === 'DELETE' ? r.old_amount : r.new_amount ?? r.old_amount)}
                </span>
                {r.new_award_balance != null && (
                  <div className="cell-sub">
                    balance {fmtCompact(r.old_award_balance)} → {fmtCompact(r.new_award_balance)}
                  </div>
                )}
                <div className="cell-sub">{r.changed_at} · {r.changed_by || '—'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-12">
          <div className="eyebrow">Cash flow</div>
          <h2>Monthly spend on this grant</h2>
          <div className="c-sub">Net of adjustments</div>
          <TrendChart rows={monthly} height={200} />
        </div>
      </div>

      <AmendmentModal open={amendOpen} onClose={() => setAmendOpen(false)} award={award} />
    </div>
  )
}
