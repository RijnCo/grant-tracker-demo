import { useCallback, useEffect, useRef, useState } from 'react'

/** Rounded data-end (4px), square baseline — the project's bar mark. */
export function hbarPath(x, y, w, h) {
  const r = Math.min(4, Math.max(0, w))
  const body = Math.max(0, w - r)
  return `M${x},${y} h${body} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${body} z`
}

/** Observe the rendered width of a container div. */
export function useContainerWidth(min = 320) {
  const ref = useRef(null)
  const [width, setWidth] = useState(min)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setWidth(Math.max(min, w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])
  return [ref, width]
}

/** Tooltip anchored inside a position:relative chart container. */
export function useChartTip() {
  const [tip, setTip] = useState(null) // {x, y, title, rows}
  const show = useCallback((evt, title, rows) => {
    const host = evt.currentTarget.closest('.chart-host')
    const rect = host.getBoundingClientRect()
    setTip({ x: evt.clientX - rect.left + 14, y: evt.clientY - rect.top + 14, title, rows })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  return { tip, show, hide }
}

export function ChartTip({ tip, width }) {
  if (!tip) return null
  const flip = width && tip.x > width - 190
  return (
    <div
      className="chart-tip"
      style={{ left: flip ? undefined : tip.x, right: flip ? width - tip.x + 14 : undefined, top: tip.y }}
    >
      <div className="tt-title">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div className="tt-row" key={i}>
          <span className="linekey" style={{ background: r.color || 'transparent' }} />
          <span className="v">{r.value}</span>
          <span className="n">{r.name}</span>
        </div>
      ))}
    </div>
  )
}
