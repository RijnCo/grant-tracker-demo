import { motion } from 'framer-motion'
import { fmtCompact, fmtFull } from '../../lib/format'
import { squarify } from '../../lib/revenue'
import { ChartTip, useChartTip, useContainerWidth } from './chartUtil'

/**
 * Squarified treemap: one rectangle per revenue stream, sized by its
 * contribution and colored by fund type.
 */
export default function TreemapChart({ items, height = 300, valueName = 'Collected YTD' }) {
  const [ref, W] = useContainerWidth(420)
  const { tip, show, hide } = useChartTip()
  const rows = (items || []).filter((it) => it.value > 0).sort((a, b) => b.value - a.value)
  if (rows.length === 0) return <div className="c-sub">Nothing collected yet.</div>

  const rects = squarify(rows, 0, 0, W, height, [])
  const total = rows.reduce((s, it) => s + it.value, 0)
  return (
    <div ref={ref} className="chart-host" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img"
           aria-label="Revenue contribution by stream">
        {rects.map((r, i) => (
          <motion.g key={r.name}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: i * 0.03 }}
            onPointerMove={(e) => show(e, r.name, [
              { color: r.color, value: fmtFull(r.value), name: valueName },
              { color: 'transparent', value: ((100 * r.value) / total).toFixed(1) + '%', name: 'of total' },
            ])}
            onPointerLeave={hide}>
            <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)}
                  rx={5} fill={r.color} opacity={0.82} stroke="var(--surface)" strokeWidth={1.5} />
            {r.w > 86 && r.h > 44 && (
              <>
                <text x={r.x + 10} y={r.y + 20} fill="#fff" fontSize={11.5} fontWeight={600}
                      style={{ pointerEvents: 'none' }}>
                  {r.name.length > r.w / 7 ? r.name.slice(0, Math.floor(r.w / 7)) + '…' : r.name}
                </text>
                <text x={r.x + 10} y={r.y + 36} fill="rgba(255,255,255,0.85)" fontSize={11}
                      style={{ pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCompact(r.value)}
                </text>
              </>
            )}
          </motion.g>
        ))}
      </svg>
      <ChartTip tip={tip} width={W} />
    </div>
  )
}
