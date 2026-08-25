// True when built with `vite build --mode demo` (the GitHub Pages build).
// The demo runs read-only from a bundled data snapshot: no server, no login.
export const DEMO = import.meta.env.MODE === 'demo'

export const DEMO_USER = {
  username: 'demo',
  display_name: 'Demo Viewer',
  role: 'viewer',
}
