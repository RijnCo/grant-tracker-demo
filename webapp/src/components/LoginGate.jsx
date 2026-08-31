import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../state/AppContext'
import { api } from '../lib/api'

export default function LoginGate() {
  const { login } = useApp()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(null) // null = checking

  useEffect(() => {
    api('/api/setup-status')
      .then(setSetup)
      .catch(() => setSetup({ needs_setup: false, demo_accounts: false }))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    setBusy(true)
    try {
      if (setup?.needs_setup) {
        if (f.get('password') !== f.get('password2')) {
          throw new Error('the two passwords do not match')
        }
        await api('/api/setup', {
          method: 'POST',
          body: JSON.stringify({
            username: f.get('username'),
            password: f.get('password'),
            display_name: f.get('display_name'),
          }),
        })
      }
      await login(f.get('username'), f.get('password'))
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  const firstRun = !!setup?.needs_setup
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
          <div className="lb-city">Panama City · City Operations</div>
          <div className="lb-sub">
            {firstRun
              ? 'First run — create the administrator account to get started'
              : 'Grants, revenue, CRA, and utility billing · City of Panama City, Florida'}
          </div>
        </div>
        {firstRun && (
          <>
            <label htmlFor="login-display">Your name</label>
            <input id="login-display" name="display_name" autoComplete="name"
                   placeholder="Jane Alvarez" />
          </>
        )}
        <label htmlFor="login-user">Username</label>
        <input id="login-user" name="username" autoComplete="username" required autoFocus />
        <label htmlFor="login-pass">{firstRun ? 'Choose a password (8+ characters)' : 'Password'}</label>
        <input id="login-pass" name="password" type="password"
               autoComplete={firstRun ? 'new-password' : 'current-password'} required />
        {firstRun && (
          <>
            <label htmlFor="login-pass2">Confirm password</label>
            <input id="login-pass2" name="password2" type="password"
                   autoComplete="new-password" required />
          </>
        )}
        <div className="err">{err}</div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={busy || setup === null}
                  style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? (firstRun ? 'Creating account…' : 'Signing in…')
              : firstRun ? 'Create account & sign in' : 'Sign in'}
          </button>
        </div>
        {setup?.demo_accounts && (
          <div className="demo-creds">
            Demo accounts<br />
            <code>alopez / Sunshine!2026</code> grant manager ·{' '}
            <code>jrivera / SandDollar!26</code> finance ·{' '}
            <code>viewer / Welcome!2026</code> read-only
          </div>
        )}
      </motion.form>
    </div>
  )
}
