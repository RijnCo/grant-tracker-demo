import { useState } from 'react'
import { motion } from 'framer-motion'
import { fmtCompact, fmtFull } from '../../lib/format'
import { ChartTip, useChartTip, useContainerWidth } from './chartUtil'

/** Monthly line with area wash, crosshair, and snap tooltip. */
export default function TrendChart({ rows, height = 240 }) {
  const [ref, W] = useContainerWidth(520)
  const { tip, show, hide } = useChartTip()
  const [cursor, setCursor] = useState(null) // snapped index
  if (rows.length < 2) return <div className="c-sub">Not enough data for a trend.</div>

  const H = height
  const padL = 56, padR = 16, padT = 12, padB = 28
  const plotW = W - padL - padR, plotH = H - padT - padB
  const max = Math.max(...rows.map((r) => r.total))
  const niceMax = Math.max(1, Math.ceil(max / 250000)) * 250000
  const x = (i) => padL + (plotW * i) / (rows.length - 1)
  const y = (v) => padT + plotH * (1 - v / niceMax)
  const pts = rows.map((r, i) => [x(i), y(Math.max(0, r.total))])
  const lineD = 'M' + pts.map((p) => p.join(',')).join(' L')
  const areaD = lineD +
    ` L${pts[pts.length - 1][0]},${padT + plotH} L${pts[0][0]},${padT + plotH} Z`
  const step = Math.ceil(rows.length / 9)

  const onMove = (e) => {
    const rect = e.currentTarget.closest('svg').getBoundingClientRect()
    const mx = ((e.clientX - rect.left) * W) / rect.width
    let i = Math.round(((mx - padL) / plotW) * (rows.length - 1))
    i = Math.max(0, Math.min(rows.length - 1, i))
    setCursor(i)
    show(e, rows[i].month + ' · ' + rows[i].fy_label, [
      { color: 'var(--series-1)', value: fmtFull(rows[i].total), name: 'Net expenditures' },
    ])
  }

  return (
    <div ref={ref} className="chart-host" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label="Monthly expenditure trend">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="gridline" x1={padL} y1={padT + (plotH * i) / 4}
                  x2={W - padR} y2={padT + (plotH * i) / 4} />
            <text className="axis-label" x={padL - 8} y={padT + (plotH * i) / 4 + 4} textAnchor="end">
              {fmtCompact((niceMax * (4 - i)) / 4)}
            </text>
          </g>
        ))}
        <line className="chart-baseline" x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} />
        {rows.map((r, i) =>
          (i === rows.length - 1 || (i % step === 0 && rows.length - 1 - i >= step * 0.7)) && (
            <text key={r.month} className="axis-label" x={x(i)} y={H - 8}
                  textAnchor={i === rows.length - 1 ? 'end' : 'middle'}>
              {r.month}
            </text>
          ))}
        <motion.path fill="var(--area-wash)" stroke="none" d={areaD}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }} />
        <motion.path fill="none" stroke="var(--series-1)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" d={lineD}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.3, 0.9, 0.4, 1] }} />
        {cursor != null && (
          <g>
            <line stroke="var(--baseline)" strokeWidth={1}
                  x1={x(cursor)} x2={x(cursor)} y1={padT} y2={padT + plotH} />
            <circle r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2}
                    cx={x(cursor)} cy={pts[cursor][1]} />
          </g>
        )}
        <circle r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2}
                cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} />
        <text className="bar-value" x={pts[pts.length - 1][0] - 6} y={pts[pts.length - 1][1] - 10}
              textAnchor="end">
          {fmtCompact(rows[rows.length - 1].total)}
        </text>
        <rect className="hit" x={padL} y={0} width={plotW} height={H}
              onPointerMove={onMove}
              onPointerLeave={() => { setCursor(null); hide() }} />
      </svg>
      <ChartTip tip={tip} width={W} />
    </div>
  )
}
