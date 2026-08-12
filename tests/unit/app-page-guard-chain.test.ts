/**
 * B10 — toda página autenticada tiene que estar cubierta por un guard, y las
 * zonas solo-admin tienen que estar cubiertas por el guard de ADMIN.
 *
 * Por qué estático y no un test de runtime: parte de la cobertura no la da la
 * página, la da el layout que tiene encima. Eso funciona (Next corre el layout y
 * su `redirect()` aborta el render), pero es invisible desde el archivo de la
 * página. La protección es una propiedad del ÁRBOL, así que el chequeo también.
 *
 * Lo que este test frena, concretamente:
 *   1. Una página nueva bajo `(admin)`/`(player)`/`(super-admin)` en un lugar
 *      donde ningún layout guarda.
 *   2. `settings/layout.tsx` perdiendo su `requireAdminStaff()` — es lo que
 *      rebota al Encargado de Configuración.
 *   3. Un route group nuevo que nace público sin que nadie lo haya decidido:
 *      los públicos están enumerados a mano abajo.
 *   4. Una página nueva bajo `(admin)` que autentica a mano con
 *      `extractAuthUser` en vez de nombrar un guard de staff.
 *
 * El punto 4 se pudo apretar recién cuando el barrido de B10 dejó las 19 páginas
 * que leían `extractAuthUser` crudo pasando por `requireOperatorStaff` /
 * `requireAdminStaff`. Antes de eso la regla habría sido 19 tests rojos, así que
 * la versión anterior de este archivo aceptaba `extractAuthUser` como guard en
 * cualquier parte del árbol — y con eso una página admin nueva podía nacer sin
 * chequeo de rol y pasar igual.
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

/**
 * Guards que sí miran el rol contra `tenant_staff_members`. `extractAuthUser` NO
 * es uno: devuelve el usuario staff sin leer el rol (el claim del JWT está
 * hardcodeado en 'admin' y nunca es protección).
 *
 * `requireCajaContext` (`src/app/(admin)/caja/queries.ts`) entra porque envuelve
 * a `requireOperatorStaff` y le suma el día operativo — es el contexto compartido
 * de las 4 pantallas de Caja. Si alguien le saca el guard adentro, lo que se pone
 * rojo es el test de más abajo que verifica justamente eso.
 */
const STAFF_GUARDS = ['requireAdminStaff', 'requireOperatorStaff', 'requireCajaContext'] as const

/** El panel del complejo: acá el rol siempre existe, así que siempre se lee. */
const STAFF_TREE = '(admin)'

/**
 * Redirects de compatibilidad de la Fase 4 (renombres de rutas): no renderizan
 * nada, así que no tienen a quién autenticar. Enumerados a mano, mismo criterio
 * que `PUBLIC_ROOTS`: una página nueva NO hereda la excepción. El test de abajo
 * verifica que cada una siga siendo un redirect pelado, para que la lista no
 * sirva de tapadera de una pantalla real.
 */
const REDIRECT_STUBS = [
  join('(admin)', 'metricas', 'page.tsx'),
  join('(admin)', 'reportes', 'page.tsx'),
  join('(admin)', 'deudas', 'page.tsx'),
  join('(admin)', 'canchas', 'page.tsx'),
  join('(admin)', 'staff', 'page.tsx'),
  join('(admin)', 'settings', 'page.tsx'),
  join('(admin)', 'jugadores', 'deudas', 'page.tsx'),
] as const

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

  const stubs = PAGES.filter((p) =>
    REDIRECT_STUBS.includes(p.rel as (typeof REDIRECT_STUBS)[number]),
  )

  it('los 7 redirects de compat existen (si alguien borra uno, la lista miente)', () => {
    expect(stubs.map((s) => s.rel).sort()).toEqual([...REDIRECT_STUBS].sort())
  })

  it.each(stubs.map((p) => [p.rel, p.file]))(
    '%s sigue siendo un redirect pelado, no una pantalla exenta de guard',
    (_rel, file) => {
      const source = readFileSync(file as string, 'utf8')
      expect(source).toContain('redirect(')
      // Sin JSX y sin tocar la base: si a alguno le crece contenido, deja de ser
      // un stub y tiene que salir de la lista y pasar por un guard.
      expect(source).not.toContain('withTenantContext')
      expect(source).not.toMatch(/return\s*\(/)
    },
  )

  const delPanel = PAGES.filter(
    (p) =>
      p.rel.startsWith(STAFF_TREE + sep) &&
      !REDIRECT_STUBS.includes(p.rel as (typeof REDIRECT_STUBS)[number]),
  )

  it('hay páginas del panel que verificar', () => {
    expect(delPanel.length).toBeGreaterThan(20)
  })

  it.each(delPanel.map((p) => [p.rel, p.file]))(
    '%s nombra un guard de staff en su PROPIO archivo',
    (_rel, file) => {
      // En su propio archivo y no en la cadena: heredarlo del layout alcanza para
      // estar protegido, pero deja la página sin decir con qué. El barrido de B10
      // dejó las 19 que leían `extractAuthUser` crudo pasando por un guard, y esta
      // regla es lo que impide que la 20ª nazca de nuevo así.
      const source = readFileSync(file as string, 'utf8')
      const encontrados = STAFF_GUARDS.filter((g) => source.includes(g))
      expect(
        encontrados,
        `usá requireOperatorStaff() o requireAdminStaff() en vez de extractAuthUser crudo`,
      ).not.toHaveLength(0)
    },
  )

  it('requireCajaContext envuelve un guard de staff de verdad', () => {
    // Es el único indirecto que acepta STAFF_GUARDS: las 4 pantallas de Caja lo
    // nombran a él y no al guard. Sin este chequeo, vaciarlo dejaría a las cuatro
    // pasando el test de arriba sin ningún chequeo de rol detrás.
    const source = readFileSync(join(APP_DIR, '(admin)', 'caja', 'queries.ts'), 'utf8')
    expect(source).toContain('requireOperatorStaff()')
    // La forma de LLAMADA, no la palabra: el docblock de arriba nombra
    // `extractAuthUser` justamente para contar que ya no se usa, y un
    // `toContain` pelado se pondría rojo por el comentario que lo explica.
    expect(source, 'volvió a autenticar a mano').not.toMatch(/await\s+extractAuthUser\(/)
  })
})
