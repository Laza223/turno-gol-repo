/**
 * B10 — toda página autenticada tiene que estar cubierta por un guard, y las
 * zonas solo-admin tienen que estar cubiertas por el guard de ADMIN.
 *
 * Por qué estático y no un test de runtime: la cobertura acá no la da la página,
 * la da el layout que tiene encima. Eso funciona (Next corre el layout y su
 * `redirect()` aborta el render), pero es invisible desde el archivo de la
 * página — 12 de ellas leen `extractAuthUser` crudo sin nombrar ningún guard, y
 * quien las lee no tiene forma de saber si están protegidas o si alguien se
 * olvidó. La protección es una propiedad del ÁRBOL, así que el chequeo también.
 *
 * Lo que este test frena, concretamente:
 *   1. Una página nueva bajo `(admin)`/`(player)`/`(super-admin)` en un lugar
 *      donde ningún layout guarda.
 *   2. `settings/layout.tsx` perdiendo su `requireAdminStaff()` — hoy es lo
 *      ÚNICO que impide que un Encargado entre a Configuración, y ninguna de las
 *      páginas de adentro lo repite.
 *   3. Un route group nuevo que nace público sin que nadie lo haya decidido:
 *      los públicos están enumerados a mano abajo.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const APP_DIR = join(process.cwd(), 'src', 'app')

/** Guards que cuentan como "esta rama del árbol está autenticada". */
const GUARD_PATTERNS = [
  'requireAdminStaff',
  'requireOperatorStaff',
  'requireSystemAdmin',
  'extractAuthUser',
  'resolveImpersonatedStaffContext',
] as const

/**
 * Route groups públicos por diseño. `(public)` y `(business)` son el portal y
 * las páginas comerciales; `(auth)` es login/registro (guardarlo sería un
 * bucle); `reserva/` es el retorno de MercadoPago, que llega sin sesión; la
 * `page.tsx` de la raíz es el landing. Enumerados a mano a propósito: un grupo
 * nuevo NO hereda esta excepción.
 */
const PUBLIC_ROOTS = ['(public)', '(business)', '(auth)', 'reserva'] as const
const PUBLIC_FILES = ['page.tsx'] as const

/**
 * Páginas que no se protegen con auth sino con el portón de no-producción: no
 * tienen usuario, directamente no deben EXISTIR en un deploy real.
 */
const MOCK_ONLY_ROOTS = ['mock-mp'] as const
const MOCK_GATE = 'computeMpMockEnabled'

/** Zonas donde el rol `manager` (Encargado) no entra — CLAUDE.md, roles 026. */
const ADMIN_ONLY_PREFIXES = [join('(admin)', 'settings')] as const

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

function guardsIn(file: string): string[] {
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return GUARD_PATTERNS.filter((g) => source.includes(g))
}

/**
 * Todos los guards que aplican a una página: los suyos más los de cada
 * `layout.tsx` por encima, hasta `src/app`.
 */
function guardChain(pageFile: string): string[] {
  const found = new Set(guardsIn(pageFile))
  let dir = join(pageFile, '..')
  for (;;) {
    for (const g of guardsIn(join(dir, 'layout.tsx'))) found.add(g)
    if (dir === APP_DIR) break
    dir = join(dir, '..')
  }
  return [...found]
}

const PAGES = walk(APP_DIR).map((f) => ({ file: f, rel: relative(APP_DIR, f) }))

describe('cadena de guards de las páginas', () => {
  it('hay páginas que analizar (control: si el walk se rompe, todo lo de abajo pasa vacío)', () => {
    expect(PAGES.length).toBeGreaterThan(30)
  })

  const esPublica = (rel: string) =>
    PUBLIC_ROOTS.some((r) => rel.startsWith(r + sep)) || PUBLIC_FILES.includes(rel as 'page.tsx')
  const esMock = (rel: string) => MOCK_ONLY_ROOTS.some((r) => rel.startsWith(r + sep))

  const protegidas = PAGES.filter((p) => !esPublica(p.rel) && !esMock(p.rel))

  it.each(protegidas.map((p) => [p.rel, p.file]))(
    '%s está cubierta por algún guard',
    (_rel, file) => {
      expect(guardChain(file as string)).not.toHaveLength(0)
    },
  )

  const mockOnly = PAGES.filter((p) => esMock(p.rel))

  it('hay páginas mock-only que verificar', () => {
    expect(mockOnly.length).toBeGreaterThan(0)
  })

  it.each(mockOnly.map((p) => [p.rel, p.file]))(
    '%s está cerrada por el portón de no-producción, no solo por MP_MOCK_MODE',
    (_rel, file) => {
      // Leer `MP_MOCK_MODE` a secas NO alcanza y no es teórico: así estaba esta
      // página, más débil que sus propias Server Actions. Con la variable
      // filtrada a un deploy prod las actions devolvían 404 y la página
      // renderizaba, publicando datos de reservas cross-tenant leídos con el
      // pool BYPASSRLS. `computeMpMockEnabled` es el único que suma el chequeo
      // de runtime no-productivo.
      const source = readFileSync(file as string, 'utf8')
      expect(source).toContain(MOCK_GATE)
    },
  )

  const soloAdmin = PAGES.filter((p) => ADMIN_ONLY_PREFIXES.some((pre) => p.rel.startsWith(pre)))

  it('hay páginas solo-admin que verificar', () => {
    expect(soloAdmin.length).toBeGreaterThan(0)
  })

  it.each(soloAdmin.map((p) => [p.rel, p.file]))(
    '%s exige rol admin en su cadena',
    (_rel, file) => {
      // `extractAuthUser` NO alcanza: devuelve el usuario staff sin mirar el rol
      // (el claim del JWT está hardcodeado en 'admin' y nunca es protección).
      // Solo `requireAdminStaff` lee `tenant_staff_members` y rebota al manager.
      expect(guardChain(file as string)).toContain('requireAdminStaff')
    },
  )
})
