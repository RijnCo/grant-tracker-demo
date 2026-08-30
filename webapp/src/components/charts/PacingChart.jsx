import { useState } from 'react'
import { motion } from 'framer-motion'
import { fmtCompact, fmtFull } from '../../lib/format'
import { ChartTip, useChartTip, useContainerWidth } from './chartUtil'

/**
 * Dual-axis fiscal-year pacing: monthly collections as bars (right scale),
 * cumulative actual vs. the cumulative seasonal baseline as lines (left
 * scale). The baseline spans the whole year; actuals stop at the as-of month.
 */
export default function PacingChart({ rows, height = 260 }) {
  const [ref, W] = useContainerWidth(520)
  const { tip, show, hide } = useChartTip()
  const [cursor, setCursor] = useState(null)
  if (!rows || rows.length === 0) return <div className="c-sub">No pacing data.</div>

  const H = height
  const padL = 56, padR = 16, padT = 12, padB = 28
  const plotW = W - padL - padR, plotH = H - padT - padB
  const cumMax = Math.max(...rows.map((r) => Math.max(r.cumExpected, r.cumActual || 0)))
  const niceCum = Math.max(1, Math.ceil(cumMax / 1e6)) * 1e6
  const barMax = Math.max(1, ...rows.map((r) => r.actual || 0))
  const slot = plotW / rows.length
  const barW = Math.min(34, slot * 0.52)
  const xc = (i) => padL + slot * i + slot / 2
  const yCum = (v) => padT + plotH * (1 - v / niceCum)
  const yBar = (v) => plotH * 0.5 * (v / barMax) // bars use the lower half

  const lineD = (key) => {
    let d = ''
    rows.forEach((r, i) => {
      if (r[key] == null) return
      d += (d ? ' L' : 'M') + xc(i) + ',' + yCum(r[key])
    })
    return d
  }
  const lastActual = rows.reduce((acc, r, i) => (r.cumActual != null ? i : acc), -1)

  const onMove = (e) => {
    const rect = e.currentTarget.closest('svg').getBoundingClientRect()
    const mx = ((e.clientX - rect.left) * W) / rect.width
    let i = Math.floor((mx - padL) / slot)
    i = Math.max(0, Math.min(rows.length - 1, i))
    setCursor(i)
    const r = rows[i]
    show(e, r.label, [
      { color: 'var(--series-2)', value: r.actual == null ? '—' : fmtFull(r.actual), name: 'Collected this month' },
      { color: 'var(--series-1)', value: r.cumActual == null ? '—' : fmtFull(r.cumActual), name: 'Collected YTD' },
      { color: 'var(--baseline)', value: fmtFull(r.cumExpected), name: 'Seasonal baseline YTD' },
    ])
  }

  return (
    <div ref={ref} className="chart-host" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label="Fiscal year revenue pacing">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="gridline" x1={padL} y1={padT + (plotH * i) / 4}
                  x2={W - padR} y2={padT + (plotH * i) / 4} />
            <text className="axis-label" x={padL - 8} y={padT + (plotH * i) / 4 + 4} textAnchor="end">
              {fmtCompact((niceCum * (4 - i)) / 4)}
            </text>
          </g>
        ))}
        <line className="chart-baseline" x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} />
        {rows.map((r, i) => (
          <text key={r.label} className="axis-label" x={xc(i)} y={H - 8} textAnchor="middle">
            {r.label}
          </text>
        ))}
        {rows.map((r, i) => r.actual != null && (
          <motion.rect key={'b' + i} fill="var(--series-2)" opacity={0.55}
            x={xc(i) - barW / 2} width={barW}
            initial={{ y: padT + plotH, height: 0 }}
            animate={{ y: padT + plotH - yBar(r.actual), height: yBar(r.actual) }}
            transition={{ duration: 0.5, delay: i * 0.02 }} />
        ))}
        <path fill="none" stroke="var(--baseline)" strokeWidth={1.75}
              strokeDasharray="5 4" strokeLinejoin="round" d={lineD('cumExpected')} />
        <motion.path fill="none" stroke="var(--series-1)" strokeWidth={2.25}
          strokeLinejoin="round" strokeLinecap="round" d={lineD('cumActual')}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.3, 0.9, 0.4, 1] }} />
        {cursor != null && (
          <line stroke="var(--baseline)" strokeWidth={1}
                x1={xc(cursor)} x2={xc(cursor)} y1={padT} y2={padT + plotH} />
        )}
        {lastActual >= 0 && (
          <g>
            <circle r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2}
                    cx={xc(lastActual)} cy={yCum(rows[lastActual].cumActual)} />
            <text className="bar-value" x={xc(lastActual)} y={yCum(rows[lastActual].cumActual) - 10}
                  textAnchor="middle">
              {fmtCompact(rows[lastActual].cumActual)}
            </text>
          </g>
        )}
        <rect className="hit" x={padL} y={0} width={plotW} height={H}
              onPointerMove={onMove}
              onPointerLeave={() => { setCursor(null); hide() }} />
      </svg>
      <ChartTip tip={tip} width={W} />
    </div>
  )
}
