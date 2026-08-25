import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ToastCtx } from '../state/AppContext'

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const toast = useCallback((message, isError = false) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, message, isError }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-host">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={'toast' + (t.isError ? ' error' : '')}
              role="status"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <span className="t-dot" />
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
