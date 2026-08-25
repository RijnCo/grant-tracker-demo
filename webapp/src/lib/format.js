export const fmtFull = (n) =>
  '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtWhole = (n) => '$' + Math.round(Number(n)).toLocaleString('en-US')

export const fmtCompact = (n) => {
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M'
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K'
  return s + '$' + Math.round(a)
}

export const pctOf = (part, whole) => (whole ? Math.min(100, (100 * part) / whole) : 0)

export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const text = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
