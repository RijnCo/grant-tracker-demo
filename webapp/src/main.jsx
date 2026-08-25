import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { DEMO } from './lib/demo'
import '@fontsource-variable/inter'
import './styles/global.css'

// GitHub Pages can't rewrite deep links to index.html, so the static demo
// routes with the URL hash instead.
const Router = DEMO ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)
