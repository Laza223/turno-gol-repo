#!/usr/bin/env node
/**
 * QA visual reproducible de Storybook con agent-browser.
 *
 * Recorre la matriz (story × viewport) y por cada celda captura screenshot,
 * consola, excepciones de JS y requests de red, y corre chequeos estructurales
 * en el DOM (overflow horizontal, contenido fuera del viewport, targets táctiles
 * chicos, imágenes de tamaño cero, controles invisibles).
 *
 * No decide si algo "se ve feo": eso lo hace una persona (o un agente) mirando
 * los PNG. Lo que hace es producir la evidencia y marcar lo que es medible.
 *
 * Uso:
 *   pnpm qa:storybook                          # todas las stories, todos los viewports
 *   pnpm qa:storybook -- --session sb-mobile --viewports mobile-primary
 *   pnpm qa:storybook -- --grep "Booking/"     # filtra por título de story
 *   pnpm qa:storybook -- --url http://127.0.0.1:6007
 *
 * Requiere Storybook corriendo (pnpm storybook) o un storybook-static servido.
 */
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const VIEWPORTS = {
  'mobile-small': { width: 360, height: 800 },
  'mobile-primary': { width: 393, height: 851 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1440, height: 900 },
  'desktop-large': { width: 1920, height: 1080 },
}

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:6006',
    session: 'storybook-qa',
    viewports: Object.keys(VIEWPORTS),
    grep: null,
    out: 'artifacts/storybook-qa',
    theme: 'light',
  }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=')
    const value = inline ?? argv[i + 1]
    const bump = () => {
      if (inline === undefined) i++
    }
    if (flag === '--url') {
      args.url = value
      bump()
    } else if (flag === '--session') {
      args.session = value
      bump()
    } else if (flag === '--grep') {
      args.grep = value
      bump()
    } else if (flag === '--out') {
      args.out = value
      bump()
    } else if (flag === '--theme') {
      args.theme = value
      bump()
    } else if (flag === '--viewports') {
      args.viewports = value.split(',')
      bump()
    }
  }
  const unknown = args.viewports.filter((v) => !VIEWPORTS[v])
  if (unknown.length) {
    throw new Error(
      `Viewport desconocido: ${unknown.join(', ')}. Válidos: ${Object.keys(VIEWPORTS).join(', ')}`,
    )
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

/**
 * Invocar agent-browser desde Node en Windows es un campo minado. Lo que NO anda:
 *
 *   execFile('agent-browser')              → ENOENT  (no busca PATHEXT; es un shim .cmd)
 *   execFile('agent-browser.cmd')          → EINVAL  (Node se niega a correr un .cmd
 *                                                     sin shell desde CVE-2024-27980)
 *   execFile(..., { shell: true })         → CUELGA
 *   execFile(<.exe nativo>, stdio: 'pipe') → CUELGA
 *
 * El cuelgue es lo interesante y no es lentitud: la primera invocación levanta un
 * DAEMON que queda corriendo en background y HEREDA el pipe de stdout del hijo. El
 * comando termina, pero el pipe sigue abierto del lado del daemon, así que
 * execFileSync espera un EOF que no llega nunca.
 *
 * La salida: no darle un pipe. Se abre un archivo temporal y se le pasa su file
 * descriptor como stdout/stderr. El daemon puede heredar ese fd sin bloquear a
 * nadie, el proceso termina limpio, y la salida se lee del archivo.
 */
function resolveAgentBrowser() {
  if (process.platform !== 'win32') return 'agent-browser'
  const shim = execFileSync('where', ['agent-browser.cmd'], { encoding: 'utf8' })
    .split('\n')[0]
    .trim()
  return path.join(
    path.dirname(shim),
    'node_modules',
    'agent-browser',
    'bin',
    'agent-browser-win32-x64.exe',
  )
}

const AB_BIN = resolveAgentBrowser()
const RUN_DIR = mkdtempSync(path.join(tmpdir(), 'sb-qa-'))
process.on('exit', () => rmSync(RUN_DIR, { recursive: true, force: true }))

let callSeq = 0

/** agent-browser, aislado por sesión para poder correr varios QA en paralelo. */
function ab(cmd, { allowFail = false } = {}) {
  const outFile = path.join(RUN_DIR, `out-${callSeq++}.txt`)
  const fd = openSync(outFile, 'w')
  try {
    execFileSync(AB_BIN, ['--session', args.session, ...cmd], {
      stdio: ['ignore', fd, fd],
      timeout: 60_000,
    })
  } catch (err) {
    if (!allowFail) {
      closeSync(fd)
      throw new Error(
        `agent-browser ${cmd.join(' ')} falló: ${safeRead(outFile).slice(0, 300) || err.code}`,
      )
    }
  } finally {
    try {
      closeSync(fd)
    } catch {
      /* ya cerrado en el camino de error */
    }
  }
  return safeRead(outFile)
}

function safeRead(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Chequeos estructurales. Corren DENTRO del iframe de la story, sobre el DOM real.
 *
 * El overflow horizontal se mide contra el <html>, no contra elementos sueltos:
 * un contenedor con `overflow-x: auto` (una tabla ancha, un carrusel, el scroller
 * de la grilla) desborda A PROPÓSITO y no es un bug. Solo importa que el desborde
 * no escape al documento.
 */
const STRUCTURAL_CHECKS = `
(() => {
  const doc = document.documentElement
  const vw = doc.clientWidth
  const findings = []

  if (doc.scrollWidth > vw + 1) {
    // Culpables: elementos cuyo borde derecho pasa el viewport y que NO viven
    // dentro de un ancestro scrolleable en X.
    const scrollableInX = (el) => {
      for (let n = el; n && n !== doc; n = n.parentElement) {
        const ov = getComputedStyle(n).overflowX
        if (ov === 'auto' || ov === 'scroll') return true
      }
      return false
    }
    const culprits = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > vw + 1 && !scrollableInX(el)
      })
      .slice(0, 5)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 80)) || '',
        right: Math.round(el.getBoundingClientRect().right),
      }))
    findings.push({
      check: 'horizontal-overflow',
      detail: { scrollWidth: doc.scrollWidth, clientWidth: vw, culprits },
    })
  }

  // Targets táctiles: MASTER pide 44x44 mínimo en mobile. Solo se evalúa si el
  // viewport es angosto; en desktop un botón chico es legítimo.
  if (vw <= 768) {
    const small = [...document.querySelectorAll('button, a[href], input, select, [role="button"], [role="tab"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return false
        if (getComputedStyle(el).display === 'none') return false
        return r.height < 44 || r.width < 24
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      }))
    if (small.length) findings.push({ check: 'touch-target-too-small', detail: small })
  }

  const zeroImages = [...document.querySelectorAll('img')]
    .filter((img) => img.getBoundingClientRect().width === 0 || img.getBoundingClientRect().height === 0)
    .slice(0, 5)
    .map((img) => ({ src: (img.currentSrc || img.src || '').slice(-60), alt: img.alt }))
  if (zeroImages.length) findings.push({ check: 'zero-size-image', detail: zeroImages })

  const brokenImages = [...document.querySelectorAll('img')]
    .filter((img) => img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src))
    .slice(0, 5)
    .map((img) => ({ src: (img.currentSrc || img.src || '').slice(-60) }))
  if (brokenImages.length) findings.push({ check: 'broken-image', detail: brokenImages })

  // Un botón sin nombre accesible es invisible para un lector de pantalla.
  const unnamed = [...document.querySelectorAll('button, [role="button"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      const name = (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title')
      return !name
    })
    .slice(0, 5)
    .map((el) => ({ cls: String(el.className || '').slice(0, 60) }))
  if (unnamed.length) findings.push({ check: 'button-without-accessible-name', detail: unnamed })

  // Si las fuentes de marca no cargaron, cualquier diff visual es ruido.
  const fontsLoaded = document.fonts ? document.fonts.status === 'loaded' : null
  const bodyFont = getComputedStyle(document.body).fontFamily

  return {
    findings,
    meta: {
      scrollWidth: doc.scrollWidth,
      clientWidth: vw,
      fontsLoaded,
      bodyFont,
      hasDarkClass: doc.classList.contains('dark'),
    },
  }
})()
`

async function main() {
  const indexUrl = `${args.url}/index.json`
  const res = await fetch(indexUrl)
  if (!res.ok) {
    throw new Error(
      `No pude leer ${indexUrl} (${res.status}). ¿Está Storybook corriendo? \`pnpm storybook\``,
    )
  }
  const index = await res.json()

  const stories = Object.values(index.entries)
    .filter((e) => e.type === 'story')
    .filter((e) => (args.grep ? e.title.includes(args.grep) : true))
    .sort((a, b) => a.id.localeCompare(b.id))

  if (!stories.length) throw new Error(`Ninguna story matchea --grep "${args.grep}"`)

  console.log(
    `[qa] ${stories.length} stories × ${args.viewports.length} viewports = ${stories.length * args.viewports.length} celdas`,
  )
  console.log(`[qa] sesión: ${args.session} · tema: ${args.theme} · salida: ${args.out}`)

  const results = []

  for (const vp of args.viewports) {
    const { width, height } = VIEWPORTS[vp]
    const shotDir = path.join(args.out, 'screenshots', vp)
    mkdirSync(shotDir, { recursive: true })

    for (const story of stories) {
      const url = `${args.url}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${args.theme}`
      const cell = { storyId: story.id, title: story.title, name: story.name, viewport: vp }

      try {
        ab(['open', url])
        ab(['viewport', String(width), String(height)], { allowFail: true })

        // `console` devuelve el log ACUMULADO de la sesión, no el de la página actual.
        // Sin este --clear, en cuanto UNA story tira un error, TODAS las siguientes lo
        // heredan: la primera corrida reportó 99 "console-error" de los cuales 0 eran
        // de la story que estaba mirando.
        // Va ANTES del open final (si se limpia después, se borran los errores del
        // propio render de la story, que es justo lo que queremos capturar).
        ab(['console', '--clear'], { allowFail: true })

        // Re-abrir después de fijar el viewport: los componentes responsive leen el
        // tamaño al montar, y un resize posterior no siempre los re-mide.
        ab(['open', url])
        ab(['wait', '--load', 'networkidle'], { allowFail: true })
        ab(['wait', '--fn', 'document.fonts.status === "loaded"'], { allowFail: true })

        const shot = path.join(shotDir, `${story.id}.png`)
        ab(['screenshot', shot])

        const raw = ab(['eval', '-b', Buffer.from(STRUCTURAL_CHECKS).toString('base64'), '--json'], {
          allowFail: true,
        })
        // agent-browser eval --json devuelve { success, data: { origin, result }, error }
        let structural = null
        try {
          const parsed = JSON.parse(raw)
          structural = parsed?.data?.result ?? parsed?.result ?? parsed
        } catch {
          structural = { parseError: raw.slice(0, 300) }
        }

        const consoleOut = ab(['console'], { allowFail: true })
        const errors = consoleOut
          .split('\n')
          .filter((l) => /\[error\]|\[warning\].*(React|hydrat)/i.test(l))
          .slice(0, 10)

        // Cualquier request que no sea al propio Storybook significa que un mock
        // se escapó: la story está tocando la red de verdad.
        const network = ab(['network', 'requests'], { allowFail: true })
        const escaped = network
          .split('\n')
          .filter((l) => /https?:\/\//.test(l))
          .filter((l) => !l.includes('127.0.0.1:') && !l.includes('localhost:'))
          .slice(0, 10)

        const problems = [
          ...(structural?.findings ?? []).map((f) => f.check),
          ...(errors.length ? ['console-error'] : []),
          ...(escaped.length ? ['escaped-network-request'] : []),
        ]

        cell.status = problems.length ? 'FAIL' : 'PASS'
        cell.problems = problems
        cell.structural = structural
        cell.consoleErrors = errors
        cell.escapedRequests = escaped
        cell.screenshot = shot
      } catch (err) {
        cell.status = 'BLOCKED'
        cell.error = String(err.message ?? err).slice(0, 400)
      }

      results.push(cell)
      const mark = cell.status === 'PASS' ? '·' : cell.status === 'FAIL' ? 'x' : '!'
      process.stdout.write(mark)
    }
    process.stdout.write('\n')
  }

  mkdirSync(path.join(args.out, 'reports'), { recursive: true })
  const manifest = path.join(args.out, 'reports', `qa-${args.session}-${args.theme}.json`)
  writeFileSync(manifest, JSON.stringify({ args, results }, null, 2))

  const fails = results.filter((r) => r.status === 'FAIL')
  const blocked = results.filter((r) => r.status === 'BLOCKED')
  console.log(
    `\n[qa] PASS ${results.length - fails.length - blocked.length} · FAIL ${fails.length} · BLOCKED ${blocked.length}`,
  )
  for (const f of fails) console.log(`  FAIL ${f.viewport} ${f.storyId} → ${f.problems.join(', ')}`)
  for (const b of blocked) console.log(`  BLOCKED ${b.viewport} ${b.storyId} → ${b.error}`)
  console.log(`[qa] manifiesto: ${manifest}`)

  ab(['close'], { allowFail: true })
  // Exit 0 a propósito: este script produce evidencia, no es un gate. El gate es
  // pnpm test:storybook (render + play + axe).
}

main().catch((err) => {
  console.error(`[qa] ${err.message}`)
  process.exit(1)
})
