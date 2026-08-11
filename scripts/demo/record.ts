import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page, type Locator } from '@playwright/test'
import { addDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { buildStorageState } from '../../tests/e2e/_helpers/auth-state'

/**
 * Graba un video demo navegando la app de verdad según un guion declarativo
 * (scripts/demo/flows/<nombre>.json). Regenerable: cambia la UI → se corre de
 * nuevo. El video crudo + timeline.json (clicks/captions con timestamps) los
 * consume scripts/demo/build.mjs (ffmpeg) para el corte final.
 *
 * Requiere: Supabase local + `pnpm exec tsx scripts/demo/seed-demo-tenant.ts`
 * + dev server con el perfil mock (MP_MOCK_MODE=1 NEXT_PUBLIC_E2E=1).
 *
 * Uso: pnpm exec tsx scripts/demo/record.ts venta-cantina
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const ART = 'America/Argentina/Buenos_Aires'

const __dir = dirname(fileURLToPath(import.meta.url))

type Step =
  | { action: 'goto'; url: string }
  | { action: 'caption'; text: string }
  | { action: 'click'; role?: string; name?: string; css?: string; nth?: number }
  | { action: 'clickText'; text: string }
  | {
      action: 'fill'
      css?: string
      label?: string
      placeholder?: string
      text: string
      fast?: boolean
    }
  | { action: 'select'; label?: string; css?: string; value: string }
  | { action: 'press'; key: string }
  | { action: 'waitText'; text: string }
  | { action: 'pause'; ms: number }
  | { action: 'cut'; mode: 'start' | 'end' }

type Flow = {
  name: string
  auth: 'admin' | 'fresh' | 'player' | null
  viewport?: 'mobile' | 'desktop'
  steps: Step[]
}

type TimelineEvent = {
  t: number
  type:
    'goto' | 'ready' | 'caption' | 'click' | 'fill' | 'waitText' | 'done' | 'cutStart' | 'cutEnd'
  text?: string
  x?: number
  y?: number
}

const AUTH_EMAILS = {
  admin: 'demo-admin@turnogol.test',
  fresh: 'demo-fresh@turnogol.test',
  player: 'demo-player@turnogol.test',
} as const

const VIEWPORTS = {
  mobile: { width: 393, height: 851 },
  desktop: { width: 1440, height: 900 },
} as const

// Cursor falso + ripple: Playwright mueve un mouse virtual invisible; para el
// video inyectamos un puntero que viaja hasta el target antes de cada click.
const CURSOR_JS = `
(() => {
  if (window.__demoCursor) return
  const style = document.createElement('style')
  style.textContent = \`
    #__demo_cursor { position: fixed; z-index: 2147483647; width: 28px; height: 28px;
      border-radius: 50%; background: rgba(16,185,129,.35); border: 2.5px solid rgb(16,185,129);
      pointer-events: none; transform: translate(-50%,-50%); left: 0; top: 0;
      transition: left .45s cubic-bezier(.25,.8,.3,1), top .45s cubic-bezier(.25,.8,.3,1); }
    .__demo_ripple { position: fixed; z-index: 2147483646; width: 14px; height: 14px;
      border-radius: 50%; border: 3px solid rgb(16,185,129); pointer-events: none;
      transform: translate(-50%,-50%); animation: __demo_rip .55s ease-out forwards; }
    @keyframes __demo_rip { to { width: 72px; height: 72px; opacity: 0; } }
    nextjs-portal, [data-nextjs-dev-overlay], [data-nextjs-toast] { display: none !important; }
  \`
  document.head.appendChild(style)
  const c = document.createElement('div')
  c.id = '__demo_cursor'
  c.style.left = '50%'
  c.style.top = '60%'
  document.body.appendChild(c)
  window.__demoCursor = {
    moveTo(x, y) { c.style.left = x + 'px'; c.style.top = y + 'px' },
    ripple(x, y) {
      const r = document.createElement('div')
      r.className = '__demo_ripple'
      r.style.left = x + 'px'
      r.style.top = y + 'px'
      document.body.appendChild(r)
      setTimeout(() => r.remove(), 600)
    },
  }
})()`

// Tokens de fecha en cualquier string del flow: {date+N} (yyyy-MM-dd ART) y
// {day+N} (día del mes, para celdas de calendario).
function resolveTokens(s: string): string {
  return s
    .replace(/\{date\+(\d+)\}/g, (_m, n) =>
      formatInTimeZone(addDays(new Date(), Number(n)), ART, 'yyyy-MM-dd'),
    )
    .replace(/\{day\+(\d+)\}/g, (_m, n) =>
      formatInTimeZone(addDays(new Date(), Number(n)), ART, 'd'),
    )
}

function toLocator(page: Page, step: Extract<Step, { action: 'click' }>): Locator {
  if (step.css) return page.locator(step.css).first()
  const raw = step.name ? resolveTokens(step.name) : undefined
  const name = raw?.startsWith('re:') ? new RegExp(raw.slice(3)) : raw
  let loc = page.getByRole((step.role ?? 'button') as Parameters<Page['getByRole']>[0], { name })
  if (typeof step.nth === 'number') loc = loc.nth(step.nth)
  else loc = loc.first()
  return loc
}

async function ensureCursor(page: Page): Promise<void> {
  await page.evaluate(CURSOR_JS)
}

async function animatedClick(page: Page, loc: Locator): Promise<{ x: number; y: number }> {
  await loc.waitFor({ state: 'visible' })
  await loc.scrollIntoViewIfNeeded()
  const box = await loc.boundingBox()
  if (!box) throw new Error('click target sin boundingBox')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await ensureCursor(page)
  await page.evaluate(
    ([cx, cy]) =>
      (
        window as never as { __demoCursor: { moveTo(x: number, y: number): void } }
      ).__demoCursor.moveTo(cx!, cy!),
    [x, y],
  )
  await page.waitForTimeout(520)
  await page.evaluate(
    ([cx, cy]) =>
      (
        window as never as { __demoCursor: { ripple(x: number, y: number): void } }
      ).__demoCursor.ripple(cx!, cy!),
    [x, y],
  )
  await page.waitForTimeout(120)
  await loc.click()
  return { x, y }
}

async function main(): Promise<void> {
  const flowName = process.argv[2]
  if (!flowName) {
    console.error('Uso: tsx scripts/demo/record.ts <flow> (scripts/demo/flows/<flow>.json)')
    process.exit(1)
  }
  const flow: Flow = JSON.parse(readFileSync(join(__dir, 'flows', `${flowName}.json`), 'utf8'))
  const outDir = join(__dir, 'out', flow.name)
  mkdirSync(outDir, { recursive: true })

  const viewport = VIEWPORTS[flow.viewport ?? 'mobile']
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: 'es-AR',
    timezoneId: ART,
    storageState: flow.auth ? await buildStorageState(AUTH_EMAILS[flow.auth]) : undefined,
    recordVideo: { dir: outDir, size: viewport },
  })
  // El banner de push (fixed bottom, z-40) tapa la UI en /grilla y /caja.
  await context.addInitScript(() => {
    window.localStorage.setItem('turnogol:notif-banner-dismissed-at', new Date().toISOString())
  })

  const page = await context.newPage()
  const timeline: TimelineEvent[] = []
  const t0 = Date.now()
  const mark = (e: Omit<TimelineEvent, 't'>): void => {
    timeline.push({ t: Date.now() - t0, ...e })
  }

  try {
    for (const step of flow.steps) {
      switch (step.action) {
        case 'goto': {
          // {date+N} → fecha ART a N días (para URLs de reserva dentro de la
          // ventana de anticipación).
          const url = step.url.replace(/\{date\+(\d+)\}/g, (_m, n) =>
            formatInTimeZone(addDays(new Date(), Number(n)), ART, 'yyyy-MM-dd'),
          )
          mark({ type: 'goto', text: url })
          await page.goto(BASE_URL + url, { waitUntil: 'networkidle' })
          await ensureCursor(page)
          mark({ type: 'ready', text: url })
          break
        }
        case 'caption': {
          mark({ type: 'caption', text: step.text })
          break
        }
        case 'click': {
          const { x, y } = await animatedClick(page, toLocator(page, step))
          mark({ type: 'click', x, y, text: step.name ?? step.css })
          break
        }
        case 'clickText': {
          // {day+N} → número de día del mes (para celdas de calendario).
          const text = step.text.replace(/\{day\+(\d+)\}/g, (_m, n) =>
            formatInTimeZone(addDays(new Date(), Number(n)), ART, 'd'),
          )
          const loc = page.getByText(text, { exact: true }).first()
          const { x, y } = await animatedClick(page, loc)
          mark({ type: 'click', x, y, text })
          break
        }
        case 'fill': {
          const loc = step.css
            ? page.locator(step.css).first()
            : step.placeholder
              ? page.getByPlaceholder(new RegExp(step.placeholder)).first()
              : page.getByLabel(step.label!).first()
          const text = step.text.replace(/\{date\+(\d+)\}/g, (_m, n) =>
            formatInTimeZone(addDays(new Date(), Number(n)), ART, 'yyyy-MM-dd'),
          )
          await loc.waitFor({ state: 'visible' })
          await loc.click()
          mark({ type: 'fill', text })
          // fast: inputs date/time donde tipear por teclas es frágil.
          if (step.fast) await loc.fill(text)
          else await loc.pressSequentially(text, { delay: 55 })
          break
        }
        case 'select': {
          const loc = step.css
            ? page.locator(step.css).first()
            : page.getByLabel(step.label!).first()
          await loc.waitFor({ state: 'visible' })
          await animatedClick(page, loc)
          await loc.selectOption({ label: step.value }).catch(() => loc.selectOption(step.value))
          mark({ type: 'fill', text: `${step.label} = ${step.value}` })
          break
        }
        case 'press': {
          await page.keyboard.press(step.key)
          break
        }
        case 'waitText': {
          await page.getByText(step.text).first().waitFor({ state: 'visible', timeout: 15_000 })
          mark({ type: 'waitText', text: step.text })
          break
        }
        case 'pause': {
          await page.waitForTimeout(step.ms)
          break
        }
        case 'cut': {
          // Marca un rango a EXCLUIR del corte final (ej: el checkout mock de MP,
          // que muestra "SIMULADOR" y no puede salir en un video público).
          mark({ type: step.mode === 'start' ? 'cutStart' : 'cutEnd' })
          break
        }
      }
    }
  } catch (err) {
    // Congelar la evidencia del fallo antes de cerrar el context.
    await page.screenshot({ path: join(outDir, 'error.png'), fullPage: false }).catch(() => {})
    console.error(`URL al fallar: ${page.url()}`)
    throw err
  }
  mark({ type: 'done' })

  const video = page.video()
  await context.close()
  const rawPath = video ? await video.path() : null
  await browser.close()

  if (rawPath) {
    const finalPath = join(outDir, 'raw.webm')
    renameSync(rawPath, finalPath)
    console.log(`video:    ${finalPath}`)
  }
  writeFileSync(
    join(outDir, 'timeline.json'),
    JSON.stringify({ flow: flow.name, viewport, timeline }, null, 2),
  )
  console.log(`timeline: ${join(outDir, 'timeline.json')}`)
}

main().catch((e) => {
  console.error('record failed:', e)
  process.exit(1)
})
