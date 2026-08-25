import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/** Animated number — counts from the previous value to the new one. */
export default function CountUp({ value, format = (v) => String(Math.round(v)), duration = 0.9 }) {
  const ref = useRef(null)
  const prev = useRef(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced) {
      el.textContent = format(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { el.textContent = format(v) },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, format, duration, reduced])

  return <span ref={ref} />
}
