import { motion } from 'framer-motion'
import { fmtCompact, fmtFull } from '../../lib/format'
import { ChartTip, hbarPath, useChartTip, useContainerWidth } from './chartUtil'

/** Stacked horizontal bars: retained (teal) + passed to subrecipients (coral). */
export default function ProgramsChart({ rows }) {
  const [ref, W] = useContainerWidth(520)
  const { tip, show, hide } = useChartTip()
  if (!rows.length) return <div className="c-sub">No data in this scope.</div>

  const nameW = 205, valW = 62, rowH = 30, barH = 18, gap = 2
  const plotW = W - nameW - valW - 8
  const H = rows.length * rowH + 24
  const max = Math.max(...rows.map((r) => r.total))

  return (
    <div ref={ref} className="chart-host" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label="Expenditures by federal program">
        {[1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="gridline" x1={nameW + (plotW * i) / 4} y1={0}
                  x2={nameW + (plotW * i) / 4} y2={H - 20} />
            <text className="axis-label" x={nameW + (plotW * i) / 4} y={H - 6} textAnchor="middle">
              {fmtCompact((max * i) / 4)}
            </text>
          </g>
        ))}
        <line className="chart-baseline" x1={nameW} y1={0} x2={nameW} y2={H - 20} />
        {rows.map((r, i) => {
          const y = i * rowH + (rowH - barH) / 2
          const retained = r.total - r.to_sub
          const wRet = (plotW * retained) / max
          const wSub = (plotW * r.to_sub) / max
          const title = r.aln + ' — ' + r.program_title + (r.cluster_name ? ' · ' + r.cluster_name : '')
          return (
            <g key={r.aln + r.program_title}>
              <text className="bar-name" x={nameW - 8} y={y + barH - 5} textAnchor="end">
                {r.aln + '  ' + (r.program_title.length > 21 ? r.program_title.slice(0, 20) + '…' : r.program_title)}
              </text>
              {wRet > 0.5 && (wSub > 0.5 ? (
                <motion.rect className="bar-seg" fill="var(--series-1)" x={nameW} y={y} height={barH}
                  initial={{ width: 0 }} animate={{ width: Math.max(0, wRet - gap) }}
                  transition={{ duration: 0.5, delay: i * 0.03, ease: [0.25, 1, 0.35, 1] }} />
              ) : (
                <motion.path className="bar-seg" fill="var(--series-1)"
                  initial={{ d: hbarPath(nameW, y, 0, barH) }}
                  animate={{ d: hbarPath(nameW, y, wRet, barH) }}
                  transition={{ duration: 0.5, delay: i * 0.03, ease: [0.25, 1, 0.35, 1] }} />
              ))}
              {wSub > 0.5 && (
                <motion.path className="bar-seg" fill="var(--series-2)"
                  initial={{ d: hbarPath(nameW + wRet, y, 0, barH) }}
                  animate={{ d: hbarPath(nameW + wRet, y, wSub, barH) }}
                  transition={{ duration: 0.5, delay: i * 0.03 + 0.1, ease: [0.25, 1, 0.35, 1] }} />
              )}
              <motion.text className="bar-value" x={nameW + wRet + wSub + 6} y={y + barH - 5}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.03 }}>
                {fmtCompact(r.total)}
              </motion.text>
              <rect className="hit" x={0} y={i * rowH} width={W} height={rowH} tabIndex={0}
                onPointerMove={(e) => show(e, title, [
                  { color: 'var(--series-1)', value: fmtFull(retained), name: 'Retained' },
                  { color: 'var(--series-2)', value: fmtFull(r.to_sub), name: 'Passed to subrecipients' },
                  { color: 'transparent', value: fmtFull(r.total), name: 'Total expenditures' },
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
