import { config } from 'dotenv'
config({ path: '.env.local' })

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { buildStorageState } from '../../tests/e2e/_helpers/auth-state'

/**
 * Genera el corpus de fotos + texto de la auditoría de coherencia: 28
 * pantallas del panel admin × 2 roles (admin/manager) × 2 viewports
 * (desktop/mobile). Lo consumen agentes evaluadores que NO pueden abrir la
 * app — por eso cada pantalla deja un .png Y un .txt (árbol de accesibilidad
 * + texto visible): el .txt es tan entregable como el .png, es lo que les
 * permite citar el string EXACTO de un botón sin adivinar.
 *
 * Patrón reusado de scripts/demo/record.ts (buildStorageState, viewport +
 * locale + timezone del context, el descarte del banner de push). A
 * diferencia de ese script, este NO levanta un dev server ni graba video:
 * asume uno YA corriendo en E2E_BASE_URL (default :3000).
 *
 * NO usa tests/e2e/capture-screenshots.spec.ts como base: ese spec renombra
 * la tabla `bookings` en caliente y muta fixtures compartidas de la suite
 * e2e — por eso este corpus es un script standalone aparte.
 *
 * Uso:
 *   pnpm exec tsx scripts/audit/capture-corpus.ts
 *   pnpm exec tsx scripts/audit/capture-corpus.ts --rol=admin --viewport=desktop
 *   pnpm exec tsx scripts/audit/capture-corpus.ts --solo=/caja
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const ART = 'America/Argentina/Buenos_Aires'
const __dir = dirname(fileURLToPath(import.meta.url))

// Lo escribe scripts/audit/<otro-script>.ts en paralelo; puede no existir
// todavía cuando este arranca (ver readFixture).
const FIXTURE_PATH = join(__dir, '.corpus-fixture.json')

// Mismo archivo que usa el project `visual` de playwright.config.ts: esconde
// el overlay de devtools de Next con `display:none` puro (a diferencia de un
// mask, no pinta nada encima del pixel real).
const SCREENSHOT_CSS_PATH = join(__dir, '..', '..', 'tests', 'e2e', 'visual', 'screenshot.css')

const OUT_DIR = join(__dir, '..', '..', 'docs', 'audit', 'screenshots', '2026-09')

// El admin demo ya está sembrado siempre (nota del pedido). El manager lo
// siembra el script que escribe la fixture; sin fixture, probamos el mismo
// patrón de nombre que el resto de los actores demo (demo-fresh@,
// demo-player@ en scripts/demo/record.ts). Si tampoco existe, buildStorageState
// falla y ESE rol entero se marca omitido — ver runForRoleViewport.
const DEFAULT_EMAILS = {
  admin: 'demo-admin@turnogol.test',
  manager: 'demo-manager@turnogol.test',
} as const

// Mismos valores que los projects `visual`/`visual-mobile` de
// playwright.config.ts: es el contrato de captura estable de este repo.
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 393, height: 851, deviceScaleFactor: 2 },
} as const

type Rol = 'admin' | 'manager'
type ViewportName = keyof typeof VIEWPORTS
const ROLES: readonly Rol[] = ['admin', 'manager']
const VIEWPORT_NAMES: readonly ViewportName[] = ['desktop', 'mobile']

// ─────────────────────────────────────────────────────────────────────────
// Fixture de entrada
// ─────────────────────────────────────────────────────────────────────────

/**
 * Subconjunto de .corpus-fixture.json que hace falta para armar las 7 rutas
 * con id dinámico + los dos emails de auth. El resto del esquema del
 * contrato (tenantId, courtIds, cajaFechaCerrada, los otros bookingIds…) lo
 * usan otros consumidores del mismo archivo; ninguna de las 28 rutas lo
 * necesita, así que no se modela acá.
 */
type CorpusFixture = {
  adminEmail?: string
  managerEmail?: string
  playerId?: string
  tournamentId?: string
  tournamentMatchId?: string
  bookingConSaldoPendienteId?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function readFixture(): CorpusFixture | null {
  if (!existsSync(FIXTURE_PATH)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    if (!isRecord(raw)) return null
    const bookingIds = isRecord(raw.bookingIds) ? raw.bookingIds : {}
    return {
      adminEmail: str(raw.adminEmail),
      managerEmail: str(raw.managerEmail),
      playerId: str(raw.playerId),
      tournamentId: str(raw.tournamentId),
      tournamentMatchId: str(raw.tournamentMatchId),
      bookingConSaldoPendienteId: str(bookingIds.conSaldoPendiente),
    }
  } catch {
    // JSON a medio escribir por el script paralelo, por ejemplo. Tratalo
    // igual que "no existe": las estáticas se capturan de todos modos.
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Las 28 rutas
// ─────────────────────────────────────────────────────────────────────────

type RouteResolution = { ok: true; path: string } | { ok: false; motivo: string }

type RouteDef = {
  /** Ruta pedida tal cual aparece en el contrato, ej. '/torneos/{tournamentId}/fixture'. */
  template: string
  /** Nombre de archivo estable entre corridas: '/' -> '_', sin el id crudo. */
  slug: string
  resolve: () => RouteResolution
}

function slugify(template: string): string {
  return template
    .replace(/^\//, '')
    .replace(/\{[^}]+\}/g, '[id]')
    .replace(/\//g, '_')
}

function buildRoutes(fixture: CorpusFixture | null): RouteDef[] {
  const est = (path: string): RouteDef => ({
    template: path,
    slug: slugify(path),
    resolve: () => ({ ok: true, path }),
  })

  const dyn = (
    template: string,
    ids: Array<{ valor: string | undefined; campo: string }>,
    path: (valores: string[]) => string,
  ): RouteDef => ({
    template,
    slug: slugify(template),
    resolve: () => {
      if (!fixture) {
        return { ok: false, motivo: 'no existe scripts/audit/.corpus-fixture.json' }
      }
      const faltante = ids.find((i) => !i.valor)
      if (faltante) {
        return { ok: false, motivo: `falta "${faltante.campo}" en la fixture` }
      }
      return { ok: true, path: path(ids.map((i) => i.valor as string)) }
    },
  })

  return [
    // Estáticas (21)
    est('/dashboard'),
    est('/grilla'),
    est('/reservas'),
    est('/abonados'),
    est('/abonados/nuevo'),
    est('/jugadores'),
    est('/caja'),
    est('/caja/cantina'),
    est('/caja/deudas'),
    est('/caja/devoluciones'),
    est('/caja/productos'),
    est('/analiticas'),
    est('/settings/avisos'),
    est('/settings/canchas'),
    est('/settings/equipo'),
    est('/settings/facturacion'),
    est('/settings/horarios'),
    est('/settings/perfil'),
    est('/settings/reservas'),
    est('/torneos'),
    est('/torneos/nuevo'),
    // Con id dinámico (7)
    dyn(
      '/reservas/{conSaldoPendiente}',
      [{ valor: fixture?.bookingConSaldoPendienteId, campo: 'bookingIds.conSaldoPendiente' }],
      ([id]) => `/reservas/${id}`,
    ),
    dyn(
      '/jugadores/{playerId}',
      [{ valor: fixture?.playerId, campo: 'playerId' }],
      ([id]) => `/jugadores/${id}`,
    ),
    dyn(
      '/torneos/{tournamentId}',
      [{ valor: fixture?.tournamentId, campo: 'tournamentId' }],
      ([id]) => `/torneos/${id}`,
    ),
    dyn(
      '/torneos/{tournamentId}/fixture',
      [{ valor: fixture?.tournamentId, campo: 'tournamentId' }],
      ([id]) => `/torneos/${id}/fixture`,
    ),
    dyn(
      '/torneos/{tournamentId}/inscripciones',
      [{ valor: fixture?.tournamentId, campo: 'tournamentId' }],
      ([id]) => `/torneos/${id}/inscripciones`,
    ),
    dyn(
      '/torneos/{tournamentId}/posiciones',
      [{ valor: fixture?.tournamentId, campo: 'tournamentId' }],
      ([id]) => `/torneos/${id}/posiciones`,
    ),
    dyn(
      '/torneos/{tournamentId}/partidos/{tournamentMatchId}',
      [
        { valor: fixture?.tournamentId, campo: 'tournamentId' },
        { valor: fixture?.tournamentMatchId, campo: 'tournamentMatchId' },
      ],
      ([tid, mid]) => `/torneos/${tid}/partidos/${mid}`,
    ),
  ]
}

function matchesSolo(route: RouteDef, solo: string): boolean {
  const norm = solo.replace(/^\//, '')
  return route.template.replace(/^\//, '') === norm || route.slug === solo || route.slug === norm
}

// ─────────────────────────────────────────────────────────────────────────
// Manifiesto
// ─────────────────────────────────────────────────────────────────────────

type CapturaEntry = {
  ruta: string
  rutaResuelta: string | null
  urlFinal: string | null
  redirigidoA: string | null
  rol: Rol
  viewport: ViewportName
  png: string | null
  txt: string | null
  tituloEnPantalla: string | null
  omitida: boolean
  motivo: string | null
}

function estadoDe(e: CapturaEntry): string {
  if (e.omitida) return `Omitida — ${e.motivo}`
  if (e.redirigidoA) return `Redirigido a \`${e.redirigidoA}\``
  return 'OK'
}

function buildIndice(manifest: CapturaEntry[]): string {
  const lines: string[] = [
    '# Índice de capturas — corpus de auditoría de coherencia',
    '',
    `Generado: ${new Date().toISOString()}`,
    '',
  ]
  for (const rol of ROLES) {
    for (const viewport of VIEWPORT_NAMES) {
      const subset = manifest.filter((e) => e.rol === rol && e.viewport === viewport)
      if (subset.length === 0) continue
      lines.push(
        `## ${rol} / ${viewport}`,
        '',
        '| Ruta | Título en pantalla | Estado |',
        '| --- | --- | --- |',
      )
      for (const e of subset) {
        lines.push(`| \`${e.ruta}\` | ${e.tituloEnPantalla ?? '—'} | ${estadoDe(e)} |`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

function writeManifest(manifest: CapturaEntry[]): void {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'capturas.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(OUT_DIR, 'INDICE.md'), buildIndice(manifest))
  console.log(`manifiesto: ${join(OUT_DIR, 'capturas.json')}`)
  console.log(`índice:     ${join(OUT_DIR, 'INDICE.md')}`)
}

// ─────────────────────────────────────────────────────────────────────────
// Captura
// ─────────────────────────────────────────────────────────────────────────

async function waitForScreenSettled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {})
  // Un heading visible es señal más confiable de hidratación/fuentes que un
  // timeout fijo. Si la pantalla no tiene uno (p. ej. quedó vacía por un
  // rebote de rol), seguimos igual: no es motivo para no fotografiarla.
  await page
    .locator('h1, h2, [role="heading"]')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => {})
  await page.waitForTimeout(300)
}

function buildTxt(params: {
  url: string
  titulo: string | null
  aria: string
  texto: string
}): string {
  return [
    `URL: ${params.url}`,
    `Título: ${params.titulo ?? '(sin heading visible)'}`,
    '',
    '--- Árbol de accesibilidad ---',
    params.aria,
    '',
    '--- Texto visible ---',
    params.texto,
    '',
  ].join('\n')
}

async function captureRoute(
  page: Page,
  route: RouteDef,
  rol: Rol,
  viewport: ViewportName,
): Promise<CapturaEntry> {
  const base: Omit<CapturaEntry, 'rutaResuelta' | 'urlFinal' | 'omitida' | 'motivo'> = {
    ruta: route.template,
    redirigidoA: null,
    rol,
    viewport,
    png: null,
    txt: null,
    tituloEnPantalla: null,
  }

  const resolved = route.resolve()
  if (!resolved.ok) {
    return { ...base, rutaResuelta: null, urlFinal: null, omitida: true, motivo: resolved.motivo }
  }

  try {
    await page.goto(BASE_URL + resolved.path, { waitUntil: 'networkidle', timeout: 30_000 })
    // No falla la captura si el stylesheet no aplica por algún motivo raro.
    await page.addStyleTag({ path: SCREENSHOT_CSS_PATH }).catch(() => {})
    await waitForScreenSettled(page)

    const finalUrl = page.url()
    const finalPath = new URL(finalUrl).pathname
    const redirigidoA = finalPath !== resolved.path ? finalPath : null

    const heading = page.locator('h1, h2, [role="heading"]').first()
    const headingVisible = await heading.isVisible().catch(() => false)
    const tituloEnPantalla = headingVisible
      ? ((await heading.innerText().catch(() => null))?.trim() ?? null)
      : null

    const pngRel = `${viewport}/${rol}/${route.slug}.png`
    const txtRel = `${viewport}/${rol}/${route.slug}.txt`
    await page.screenshot({ path: join(OUT_DIR, pngRel), fullPage: false })

    const aria = await page
      .locator('body')
      .ariaSnapshot()
      .catch((e: unknown) => `(no se pudo generar el árbol de accesibilidad: ${String(e)})`)
    const texto = await page
      .locator('body')
      .innerText()
      .catch((e: unknown) => `(no se pudo leer el texto visible: ${String(e)})`)
    writeFileSync(
      join(OUT_DIR, txtRel),
      buildTxt({ url: finalUrl, titulo: tituloEnPantalla, aria, texto }),
    )

    return {
      ...base,
      rutaResuelta: resolved.path,
      urlFinal: finalUrl,
      redirigidoA,
      png: pngRel,
      txt: txtRel,
      tituloEnPantalla,
      omitida: false,
      motivo: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...base,
      rutaResuelta: resolved.path,
      urlFinal: page.url() || null,
      omitida: true,
      motivo: `error al capturar: ${msg}`,
    }
  }
}

async function runForRoleViewport(
  browser: Browser,
  rol: Rol,
  viewport: ViewportName,
  routes: RouteDef[],
  fixture: CorpusFixture | null,
): Promise<CapturaEntry[]> {
  const email =
    (rol === 'admin' ? fixture?.adminEmail : fixture?.managerEmail) ?? DEFAULT_EMAILS[rol]

  let storageState: Awaited<ReturnType<typeof buildStorageState>>
  try {
    storageState = await buildStorageState(email)
  } catch (err) {
    // Sin sesión no hay nada que fotografiar: todas las rutas de este rol se
    // marcan omitidas, pero el barrido de los OTROS rol/viewport sigue.
    const msg = err instanceof Error ? err.message : String(err)
    return routes.map((route) => ({
      ruta: route.template,
      rutaResuelta: null,
      urlFinal: null,
      redirigidoA: null,
      rol,
      viewport,
      png: null,
      txt: null,
      tituloEnPantalla: null,
      omitida: true,
      motivo: `no se pudo autenticar como ${rol} (${email}): ${msg}`,
    }))
  }

  const dims = VIEWPORTS[viewport]
  const context: BrowserContext = await browser.newContext({
    viewport: { width: dims.width, height: dims.height },
    deviceScaleFactor: dims.deviceScaleFactor,
    locale: 'es-AR',
    timezoneId: ART,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    storageState,
  })
  // El banner de push (fixed bottom, z-40) tapa la UI en /grilla y /caja —
  // mismo fix que scripts/demo/record.ts.
  await context.addInitScript(() => {
    window.localStorage.setItem('turnogol:notif-banner-dismissed-at', new Date().toISOString())
  })

  const page = await context.newPage()
  const entries: CapturaEntry[] = []
  for (const route of routes) {
    entries.push(await captureRoute(page, route, rol, viewport))
  }
  await context.close()
  return entries
}

// ─────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────

function isRol(v: string): v is Rol {
  return v === 'admin' || v === 'manager'
}

function isViewportName(v: string): v is ViewportName {
  return v === 'desktop' || v === 'mobile'
}

function parseArgs(argv: string[]): { rol?: Rol; viewport?: ViewportName; solo?: string } {
  const out: { rol?: Rol; viewport?: ViewportName; solo?: string } = {}
  for (const arg of argv) {
    const [key, value] = arg.split('=')
    if (key === '--rol' && value && isRol(value)) out.rol = value
    else if (key === '--viewport' && value && isViewportName(value)) out.viewport = value
    else if (key === '--solo' && value) out.solo = value
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const rolesToRun = args.rol ? [args.rol] : ROLES
  const viewportsToRun = args.viewport ? [args.viewport] : VIEWPORT_NAMES

  const fixture = readFixture()
  if (!fixture) {
    console.warn(
      `aviso: ${FIXTURE_PATH} no existe o es inválida — las 7 rutas con id dinámico se registran como omitidas.`,
    )
  }

  const allRoutes = buildRoutes(fixture)
  const routes = args.solo ? allRoutes.filter((r) => matchesSolo(r, args.solo!)) : allRoutes
  if (args.solo && routes.length === 0) {
    console.error(`--solo=${args.solo} no matchea ninguna de las 28 rutas del corpus`)
    process.exit(1)
  }

  for (const viewport of viewportsToRun) {
    for (const rol of rolesToRun) {
      mkdirSync(join(OUT_DIR, viewport, rol), { recursive: true })
    }
  }

  const browser = await chromium.launch()
  const manifest: CapturaEntry[] = []
  try {
    for (const rol of rolesToRun) {
      for (const viewport of viewportsToRun) {
        console.log(`── ${rol} / ${viewport} (${routes.length} rutas) ──`)
        const entries = await runForRoleViewport(browser, rol, viewport, routes, fixture)
        manifest.push(...entries)
        const omitidas = entries.filter((e) => e.omitida).length
        console.log(`   ${entries.length - omitidas} capturadas, ${omitidas} omitidas`)
      }
    }
  } finally {
    await browser.close()
    // Se escribe SIEMPRE, incluso si algo de arriba tiró: un corpus parcial
    // con manifiesto vale más que uno completo sin manifiesto.
    writeManifest(manifest)
  }

  const omitidasTotal = manifest.filter((e) => e.omitida).length
  console.log(
    `\nTotal: ${manifest.length} entradas, ${manifest.length - omitidasTotal} OK, ${omitidasTotal} omitidas.`,
  )
}

main().catch((e) => {
  console.error('capture-corpus failed:', e)
  process.exit(1)
})
