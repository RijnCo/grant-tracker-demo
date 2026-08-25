// Derivations over the /api/data payload. Every aggregation reads from the
// expenditure ledger so all pages agree with each other.

export function expInScope(data, { fy = 'ALL', awardId = 'ALL', source = 'ALL' } = {}) {
  let rows = data.expenditures || []
  if (fy !== 'ALL') rows = rows.filter((r) => r.fy_label === fy)
  if (awardId !== 'ALL') rows = rows.filter((r) => r.award_id === awardId)
  if (source !== 'ALL') rows = rows.filter((r) => r.funding_source === source)
  return rows
}

export function aggSefa(exps) {
  const m = new Map()
  for (const r of exps) {
    const k = r.aln + '|' + r.program_title
    const cur = m.get(k) || {
      aln: r.aln, program_title: r.program_title, agency_name: r.agency_name,
      cluster_name: r.cluster_name, total: 0, to_sub: 0,
    }
    cur.total += r.amount
    cur.to_sub += r.to_sub
    m.set(k, cur)
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}

// SESFA lines: one row per state program (CSFA number), keeping the award
// type and the contract/agreement numbers that make it up.
export function aggSesfa(exps) {
  const m = new Map()
  for (const r of exps) {
    const k = r.aln + '|' + r.program_title
    const cur = m.get(k) || {
      csfa: r.aln, program_title: r.program_title, agency_name: r.agency_name,
      state_award_type: r.state_award_type, contracts: new Set(), total: 0, to_sub: 0,
    }
    cur.total += r.amount
    cur.to_sub += r.to_sub
    if (r.fain_or_ptin) cur.contracts.add(r.fain_or_ptin)
    m.set(k, cur)
  }
  return [...m.values()]
    .map((r) => ({ ...r, contracts: [...r.contracts].join(', ') }))
    .sort((a, b) => (a.csfa < b.csfa ? -1 : 1))
}

export function aggDepts(exps) {
  const m = new Map()
  for (const r of exps) {
    const name = r.department_name || 'Unassigned'
    const cur = m.get(name) || { department_name: name, total: 0, txns: 0 }
    cur.total += r.amount
    cur.txns += 1
    m.set(name, cur)
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}

export function aggMonthly(exps) {
  const m = new Map()
  for (const r of exps) {
    const month = r.transaction_date.slice(0, 7)
    const cur = m.get(month) || { month, fy_label: r.fy_label, total: 0 }
    cur.total += r.amount
    m.set(month, cur)
  }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

export function aggAgencies(data, exps) {
  // agency -> {total, to_sub, programs: Map(aln -> {title, total}), awards: Set}
  const m = new Map()
  for (const r of exps) {
    const cur = m.get(r.agency_name) || {
      agency_name: r.agency_name, funding_source: r.funding_source,
      total: 0, to_sub: 0, programs: new Map(), awards: new Set(),
    }
    cur.total += r.amount
    cur.to_sub += r.to_sub
    const p = cur.programs.get(r.aln) || { aln: r.aln, title: r.program_title, total: 0 }
    p.total += r.amount
    cur.programs.set(r.aln, p)
    cur.awards.add(r.award_id)
    m.set(r.agency_name, cur)
  }
  return [...m.values()]
    .map((a) => ({
      ...a,
      programs: [...a.programs.values()].sort((x, y) => y.total - x.total),
      awardCount: a.awards.size,
    }))
    .sort((a, b) => b.total - a.total)
}

export function docsFor(data, awardId) {
  return (data.documents || []).filter((d) => d.award_id === awardId)
}
