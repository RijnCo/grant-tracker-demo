import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../state/AppContext'

export default function LoginGate() {
  const { login } = useApp()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    setBusy(true)
    try {
      await login(f.get('username'), f.get('password'))
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <motion.form
        className="modal" style={{ width: 'min(380px, 92vw)' }}
        onSubmit={submit}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-brand">
          <div className="logo-sun" />
          <div className="lb-city">Pelican Shores City Operations</div>
          <div className="lb-sub">
            Federal award expenditure tracking · City of Pelican Shores, Florida
          </div>
        </div>
        <label htmlFor="login-user">Username</label>
        <input id="login-user" name="username" autoComplete="username" required autoFocus />
        <label htmlFor="login-pass">Password</label>
        <input id="login-pass" name="password" type="password" autoComplete="current-password" required />
        <div className="err">{err}</div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        <div className="demo-creds">
          Demo accounts<br />
          <code>alopez / Sunshine!2026</code> grant manager ·{' '}
          <code>jrivera / SandDollar!26</code> finance ·{' '}
          <code>viewer / Welcome!2026</code> read-only
        </div>
      </motion.form>
    </div>
  )
}
