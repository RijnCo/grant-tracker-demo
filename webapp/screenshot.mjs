// UI smoke test + screenshots: signs in and walks every page.
// Usage: node screenshot.mjs
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const edge = EDGE_PATHS.find(existsSync)
const browser = await chromium.launch({ executablePath: edge, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' })
await page.screenshot({ path: '_shot_login.png' })

await page.fill('#login-user', 'alopez')
await page.fill('#login-pass', 'Sunshine!2026')
await page.click('button[type=submit]')
await page.waitForSelector('.sidebar', { timeout: 8000 })
await page.waitForTimeout(1300)
await page.screenshot({ path: '_shot_overview.png' })

const routes = [
  ['/grants', '_shot_grants.png'],
  ['/grants/1', '_shot_detail.png'],
  ['/expenditures', '_shot_expenditures.png'],
  ['/agencies', '_shot_agencies.png'],
  ['/directory', '_shot_directory.png'],
  ['/audit', '_shot_audit.png'],
  ['/sefa', '_shot_sefa.png'],
  ['/sesfa', '_shot_sesfa.png'],
  ['/funds', '_shot_funds.png'],
  ['/cra', '_shot_cra.png'],
  ['/grants/13', '_shot_detail_state.png'],
]
for (const [route, file] of routes) {
  await page.goto('http://localhost:8765' + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  await page.screenshot({ path: file })
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors')
await browser.close()
