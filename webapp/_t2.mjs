import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const EDGE = ['C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'].find(existsSync)
const b = await chromium.launch({ executablePath: EDGE, headless: true })
const p = await b.newPage({ viewport: { width: 1440, height: 950 } })
await p.goto('http://localhost:8812/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1600)
await p.screenshot({ path: '_shot_tour_blank.png' })
await b.close()
