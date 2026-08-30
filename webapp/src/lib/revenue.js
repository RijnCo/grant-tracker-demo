// Client-side revenue aggregations. Like the grant pages, everything derives
// from the receipts ledger; the seasonal expected-to-date per stream comes
// precomputed from the server (revenue_status), and the monthly baseline
// curve for the pacing chart is rebuilt here from the seasonality shares.

export const FUND_COLORS = {
  general: 'var(--series-1)',
  enterprise: 'var(--series-2)',
  special_revenue: 'var(--series-3)',
}

export const FY_MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar',
                          'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']

const UNIFORM = Array(12).fill(1 / 12)

/** Map stream_id -> normalized 12-month share curve (Oct..Sep). */
export function sharesByStream(seasonality) {
  const map = new Map()
  for (const r of seasonality || []) {
    if (!map.has(r.stream_id)) map.set(r.stream_id, Array(12).fill(0))
    map.get(r.stream_id)[r.fy_month - 1] = r.share
  }
  for (const [id, shares] of map) {
    const total = shares.reduce((s, v) => s + v, 0) || 1
    map.set(id, shares.map((v) => v / total))
  }
  return map
}

const monthIndex = (dateStr, start) => {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00')
  return (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth()
}

/**
 * Twelve pacing rows for one fiscal year:
 * { label, actual, cumActual, cumExpected, elapsed } — actual/cumActual are
 * null for months after the as-of date; cumExpected spans the whole year.
 */
export function pacingRows(fyStatus, fyReceipts, sharesMap, fyRow, asOfStr) {
  const start = new Date(fyRow.start_date + 'T00:00:00')
  const actual = Array(12).fill(0)
  for (const r of fyReceipts) {
    const i = monthIndex(r.receipt_date, start)
    if (i >= 0 && i < 12) actual[i] += r.amount
  }
  const expected = Array(12).fill(0)
  for (const s of fyStatus) {
    const shares = sharesMap.get(s.stream_id) || UNIFORM
    for (let i = 0; i < 12; i++) expected[i] += s.budgeted_amount * shares[i]
  }
  const asOfIdx = asOfStr
    ? Math.min(11, monthIndex(asOfStr, start))
    : 11
  let ca = 0
  let ce = 0
  return FY_MONTHS.map((label, i) => {
    ce += expected[i]
    const elapsed = i <= asOfIdx
    if (elapsed) ca += actual[i]
    return {
      label,
      elapsed,
      actual: elapsed ? actual[i] : null,
      cumActual: elapsed ? ca : null,
      cumExpected: ce,
    }
  })
}

/** Squarified treemap layout. Items must be sorted by value descending. */
export function squarify(items, x, y, w, h, rects = []) {
  if (!items.length) return rects
  const total = items.reduce((s, it) => s + it.value, 0)
  if (total <= 0) return rects
  if (items.length === 1) {
    rects.push({ ...items[0], x, y, w, h })
    return rects
  }
  const horiz = w >= h
  const side = horiz ? h : w
  const area = w * h
  const worstFor = (count) => {
    const slice = items.slice(0, count)
    const rowSum = slice.reduce((s, it) => s + it.value, 0)
    const thick = ((rowSum / total) * area) / side
    let worst = 0
    for (const it of slice) {
      const len = (it.value / rowSum) * side
      if (len > 0 && thick > 0) worst = Math.max(worst, thick / len, len / thick)
    }
    return worst
  }
  let i = 1
  let best = worstFor(1)
  for (let k = 2; k <= items.length; k++) {
    const wk = worstFor(k)
    if (wk > best) break
    best = wk
    i = k
  }
  const row = items.slice(0, i)
  const rowSum = row.reduce((s, it) => s + it.value, 0)
  const thick = ((rowSum / total) * area) / side
  let off = 0
  for (const it of row) {
    const len = (it.value / rowSum) * side
    if (horiz) rects.push({ ...it, x, y: y + off, w: thick, h: len })
    else rects.push({ ...it, x: x + off, y, w: len, h: thick })
    off += len
  }
  return horiz
    ? squarify(items.slice(i), x + thick, y, w - thick, h, rects)
    : squarify(items.slice(i), x, y + thick, w, h - thick, rects)
}
