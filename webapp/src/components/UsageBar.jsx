export function usageColor(pct) {
  return pct > 90 ? 'var(--critical)' : pct > 75 ? 'var(--warning)' : 'var(--series-1)'
}

export default function UsageBar({ pct, width = 90 }) {
  return (
    <span className="pctcell">
      <span className="cellbar" style={{ width }}>
        <i style={{ transform: `scaleX(${pct / 100})`, background: usageColor(pct) }} />
      </span>
      {pct.toFixed(0)}%
    </span>
  )
}
