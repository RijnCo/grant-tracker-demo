import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const browser = await chromium.launch({ executablePath: edge, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addInitScript(() => localStorage.setItem('pcg-tour-done', '1'))
const page = await ctx.newPage()
await page.goto('http://localhost:8899/#/cra', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: '_shot_cra.png' })
await page.goto('http://localhost:8899/#/grants', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.click('[data-tour="source-scope"] button:nth-child(3)')
await page.waitForTimeout(700)
await page.screenshot({ path: '_shot_state_scope.png' })
await browser.close()
console.log('done')
