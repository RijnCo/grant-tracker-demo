import { motion } from 'framer-motion'
import { fmtCompact, fmtFull } from '../../lib/format'
import { ChartTip, hbarPath, useChartTip, useContainerWidth } from './chartUtil'

/** Single-hue horizontal bars — magnitude comparison. */
export default function DepartmentsChart({ rows }) {
  const [ref, W] = useContainerWidth(340)
  const { tip, show, hide } = useChartTip()
  if (!rows.length) return <div className="c-sub">No data in this scope.</div>

  const nameW = 158, valW = 62, rowH = 32, barH = 18
  const plotW = W - nameW - valW - 8
  const H = rows.length * rowH + 24
  const max = Math.max(...rows.map((r) => r.total))

  return (
    <div ref={ref} className="chart-host" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label="Spending by department">
        {[1, 2, 3].map((i) => (
          <g key={i}>
            <line className="gridline" x1={nameW + (plotW * i) / 3} y1={0}
                  x2={nameW + (plotW * i) / 3} y2={H - 20} />
            <text className="axis-label" x={nameW + (plotW * i) / 3} y={H - 6} textAnchor="middle">
              {fmtCompact((max * i) / 3)}
            </text>
          </g>
        ))}
        <line className="chart-baseline" x1={nameW} y1={0} x2={nameW} y2={H - 20} />
        {rows.map((r, i) => {
          const y = i * rowH + (rowH - barH) / 2
          const w = (plotW * r.total) / max
          return (
            <g key={r.department_name}>
              <text className="bar-name" x={nameW - 8} y={y + barH - 5} textAnchor="end">
                {r.department_name}
              </text>
              <motion.path className="bar-seg" fill="var(--series-1)"
                initial={{ d: hbarPath(nameW, y, 0, barH) }}
                animate={{ d: hbarPath(nameW, y, w, barH) }}
                transition={{ duration: 0.5, delay: i * 0.04, ease: [0.25, 1, 0.35, 1] }} />
              <motion.text className="bar-value" x={nameW + w + 6} y={y + barH - 5}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.04 }}>
                {fmtCompact(r.total)}
              </motion.text>
              <rect className="hit" x={0} y={i * rowH} width={W} height={rowH} tabIndex={0}
                onPointerMove={(e) => show(e, r.department_name, [
                  { color: 'var(--series-1)', value: fmtFull(r.total), name: 'Total spent' },
                  { color: 'transparent', value: String(r.txns), name: 'Transactions' },
                ])}
                onPointerLeave={hide} onBlur={hide} />
            </g>
          )
        })}
      </svg>
      <ChartTip tip={tip} width={W} />
    </div>
  )
}
